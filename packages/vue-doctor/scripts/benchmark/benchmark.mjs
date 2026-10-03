// False-positive benchmark: runs the built Vue Doctor against pinned public Nuxt/Vite apps and
// reports per-rule finding counts. See benchmarks/README.md.
//
//   node scripts/benchmark/benchmark.mjs [--repo <id>]... [--dead-code] [--write] [--output <file>]
//                                        [--compare] [--baseline <file>] [--summary]
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { compareResults, countFindingsByRule, renderComparison, renderRuleTable, renderSummaryTable, sumCounts } from "./lib.mjs";

const PACKAGE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BENCHMARKS_DIRECTORY = path.resolve(PACKAGE_DIRECTORY, "..", "..", "benchmarks");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const DEFAULT_RESULTS_PATH = path.join(BENCHMARKS_DIRECTORY, "results.json");
const RESULTS_FORMAT = "vue-doctor/benchmark@1";

const USAGE = `Usage: node scripts/benchmark/benchmark.mjs [options]

  --repo <id>        Only run this repo from benchmarks/repos.json (repeatable)
  --dead-code        Also run knip: installs each repo's dependencies first (slow, needs network)
  --write            Write the results to benchmarks/results.json (the committed baseline)
  --output <file>    Write the results to this file instead
  --compare          Print the per-rule delta vs. the committed results
  --baseline <file>  Compare against this results file instead of benchmarks/results.json
  --summary          Append the markdown tables to $GITHUB_STEP_SUMMARY when set
  -h, --help         Show this help

Environment: BENCHMARK_DIR  cache directory for the fetched repos (default: <os tmpdir>/vue-doctor-benchmark)
`;

const log = (message) => process.stderr.write(`${message}\n`);

/** Runs a command with an argv array (never through a shell string); resolves with its exit code. */
const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    // `shell` is only for the package-manager shims on Windows (`pnpm.cmd`); the arguments are constants.
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "inherit"], shell: options.shell === true, ...options });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

const git = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr || result.error}`);
  return result.stdout.trim();
};

/** Shallow-fetches exactly the pinned commit into `directory` (reused when it is already checked out). */
const fetchRepo = (repo, directory) => {
  const isCheckedOut = () => {
    try {
      return fs.existsSync(path.join(directory, ".git")) && git(directory, ["rev-parse", "HEAD"]) === repo.sha;
    } catch {
      return false;
    }
  };
  if (isCheckedOut()) {
    log(`[${repo.id}] using cached checkout of ${repo.sha.slice(0, 8)}`);
    return;
  }
  log(`[${repo.id}] fetching ${repo.sha.slice(0, 8)} from ${repo.url}`);
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  git(directory, ["init", "--quiet"]);
  git(directory, ["fetch", "--quiet", "--depth", "1", repo.url, repo.sha]);
  git(directory, ["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"]);
  if (git(directory, ["rev-parse", "HEAD"]) !== repo.sha) throw new Error(`Fetched commit of ${repo.id} does not match the pinned SHA.`);
};

const PACKAGE_MANAGERS = [
  { lockfile: "pnpm-lock.yaml", command: "pnpm", args: ["install", "--frozen-lockfile", "--ignore-scripts"] },
  { lockfile: "yarn.lock", command: "yarn", args: ["install", "--frozen-lockfile", "--ignore-scripts"] },
  { lockfile: "package-lock.json", command: "npm", args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"] },
];

/** Installs dependencies (without lifecycle scripts) so knip can resolve imports. */
const installDependencies = async (repo, directory) => {
  if (fs.existsSync(path.join(directory, "node_modules"))) return;
  const manager = PACKAGE_MANAGERS.find(({ lockfile }) => fs.existsSync(path.join(directory, lockfile)));
  if (!manager) throw new Error(`${repo.id}: no lockfile found, cannot install dependencies for dead-code analysis.`);
  log(`[${repo.id}] installing dependencies with ${manager.command} (--dead-code)`);
  const command = manager.command === "npm" ? "npm" : "corepack";
  const args = manager.command === "npm" ? manager.args : [manager.command, ...manager.args];
  const code = await run(command, args, { cwd: directory, shell: process.platform === "win32" });
  if (code !== 0) throw new Error(`${repo.id}: ${manager.command} install failed with exit code ${code}.`);
};

/** Runs the built Vue Doctor CLI on a checkout and returns the report@2 document plus wall-clock time. */
const analyze = async (repo, directory, reportPath, { deadCode }) => {
  fs.rmSync(reportPath, { force: true });
  const args = [
    CLI_PATH,
    directory,
    "--format", "json",
    "--output", reportPath,
    "--no-timestamp",
    "--no-cache", // honest timings and no state shared between runs
    "--offline",
    "--quiet",
    "--yes",
    ...(deadCode ? [] : ["--no-dead-code"]),
  ];
  const startedAt = performance.now();
  const code = await run(process.execPath, args, { cwd: PACKAGE_DIRECTORY });
  const durationMs = Math.round(performance.now() - startedAt);
  // Exit code 1 only means a gate failed; 2 (usage/config) and 3 (analyzer failed) are real errors.
  if (code !== 0 && code !== 1) throw new Error(`${repo.id}: vue-doctor exited with code ${code}.`);
  return { report: JSON.parse(fs.readFileSync(reportPath, "utf-8")), durationMs };
};

const main = async () => {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", multiple: true },
      "dead-code": { type: "boolean", default: false },
      write: { type: "boolean", default: false },
      output: { type: "string" },
      compare: { type: "boolean", default: false },
      baseline: { type: "string" },
      summary: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!fs.existsSync(CLI_PATH)) throw new Error(`${CLI_PATH} not found. Run \`npm run build\` first.`);

  const { repos } = JSON.parse(fs.readFileSync(path.join(BENCHMARKS_DIRECTORY, "repos.json"), "utf-8"));
  const selected = values.repo ? repos.filter((repo) => values.repo.includes(repo.id)) : repos;
  const unknown = (values.repo ?? []).filter((id) => !repos.some((repo) => repo.id === id));
  if (unknown.length > 0) throw new Error(`Unknown repo id(s): ${unknown.join(", ")}. Known: ${repos.map((repo) => repo.id).join(", ")}.`);

  // Read the baseline before anything can overwrite it (--write targets the same file).
  const baselinePath = values.compare || values.baseline ? (values.baseline ? path.resolve(values.baseline) : DEFAULT_RESULTS_PATH) : undefined;
  const baseline = baselinePath && fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf-8")) : undefined;
  if (baselinePath && !baseline) log(`No baseline at ${baselinePath}; skipping comparison.`);

  const cacheDirectory = path.resolve(process.env.BENCHMARK_DIR || path.join(os.tmpdir(), "vue-doctor-benchmark"));
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const version = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIRECTORY, "package.json"), "utf-8")).version;

  const results = {
    format: RESULTS_FORMAT,
    date: new Date().toISOString().slice(0, 10),
    vueDoctorVersion: version,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    deadCode: values["dead-code"],
    totalDurationMs: 0,
    repos: {},
  };
  for (const repo of selected) {
    const directory = path.join(cacheDirectory, `${repo.id}-${repo.sha.slice(0, 8)}`);
    fetchRepo(repo, directory);
    if (values["dead-code"]) await installDependencies(repo, directory);
    log(`[${repo.id}] analyzing`);
    // The report is written next to (not inside) the checkout: Vue Doctor never writes into the scanned project.
    const { report, durationMs } = await analyze(repo, directory, `${directory}.report.json`, { deadCode: values["dead-code"] });
    const rules = countFindingsByRule(report);
    results.repos[repo.id] = {
      url: repo.url,
      sha: repo.sha,
      durationMs,
      totalFindings: sumCounts(rules),
      errors: report.summary.errors,
      warnings: report.summary.warnings,
      rules,
    };
    results.totalDurationMs += durationMs;
  }

  const target = values.output ? path.resolve(values.output) : values.write ? DEFAULT_RESULTS_PATH : undefined;
  if (target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(results, null, 2)}\n`, "utf-8");
    log(`Wrote ${target}`);
  }

  const sections = [
    `### Vue Doctor ${version} benchmark (${results.date}, dead-code ${results.deadCode ? "on" : "off"})`,
    renderSummaryTable(results),
    "#### Findings per rule",
    renderRuleTable(results),
  ];
  if (baseline) sections.push("#### Change vs. committed results", renderComparison(compareResults(baseline, results)));
  const markdown = `${sections.join("\n\n")}\n`;
  process.stdout.write(markdown);
  if (values.summary && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  return 0;
};

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    log(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
