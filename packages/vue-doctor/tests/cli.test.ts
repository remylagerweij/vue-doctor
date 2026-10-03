import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMonorepo } from "./support/monorepo.js";
import { runCliInProcess } from "./support/run-cli-in-process.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");
const CLEAN_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "clean-vue");

const temporaryDirectories: string[] = [];
const makeDirectory = (prefix = "vdoc-cli-"): string => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temporaryDirectories.push(directory);
  return directory;
};
const copyFixture = (fixture: string): string => {
  const directory = makeDirectory();
  fs.cpSync(fixture, directory, { recursive: true });
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): void => {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "pipe",
  });
};

/** Flags that keep a run fast and independent of the user's cache. */
const FAST = ["-y", "--no-dead-code", "--no-cache"];

interface JsonReport {
  format: string;
  generatedAt?: string;
  projects: Array<{ root: string; findings: Array<{ ruleId: string; status?: string }>; score: { value: number } }>;
}

describe("CLI in process: output formats", () => {
  it("prints the score only with --score", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--score"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout.trim()).toMatch(/^\d{1,3}$/);
    // Status output never reaches stdout, in any mode.
    expect(run.stderr).not.toContain("Score:");
  });

  it("prints one report@2 document with --json and omits the timestamp with --no-timestamp", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--json", "--no-timestamp"]);
    expect(run.exitCode).toBe(0);
    const report = JSON.parse(run.stdout) as JsonReport;
    expect(report.format).toBe("vue-doctor/report@2");
    expect(report.generatedAt).toBeUndefined();
    expect(report.projects[0].findings.length).toBeGreaterThan(0);
  });

  it("prints one finding per line with --format jsonl", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--format", "jsonl"]);
    expect(run.exitCode).toBe(0);
    const lines = run.stdout.trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });

  it("prints a SARIF document with --format sarif", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--format", "sarif"]);
    expect(run.exitCode).toBe(0);
    const sarif = JSON.parse(run.stdout) as { version: string; runs: unknown[] };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs.length).toBeGreaterThan(0);
  });

  it("writes the report to --output (creating parent directories) instead of stdout", async () => {
    const target = path.join(makeDirectory(), "nested", "out", "report.json");
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--json", "--output", target]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain(`Report written to ${target}`);
    expect((JSON.parse(fs.readFileSync(target, "utf-8")) as JsonReport).format).toBe("vue-doctor/report@2");
  });

  it("renders the text report with a breakdown on stdout and the banner on stderr", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("Score:");
    expect(run.stdout).toContain("Completed in");
    expect(run.stdout).not.toContain("--verbose");
    expect(run.stderr).toContain("Vue Doctor");
    expect(run.stderr).toContain("--verbose");
  });

  it("lists findings per rule and file with --verbose and prints timings with --timings", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--verbose", "--timings"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/Security: \d+ error/);
    expect(run.stdout).toContain("→");
    expect(run.stderr).toMatch(/Timings: .*total \d+ms/);
  });

  it("reports a clean project without findings", async () => {
    const run = await runCliInProcess([CLEAN_VUE_DIRECTORY, ...FAST]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("No issues found");
  });

  it("prints only warnings and errors with --quiet", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--quiet", "--fail-on", "error"]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).not.toContain("Vue Doctor v");
    expect(run.stderr).toContain("--fail-on error");
  });

  it("prints debug details with --debug", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--debug", "--score"]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("vue-doctor:env");
    expect(run.stderr).toContain("vue-doctor:config no config file");
  });

  it("enables debug namespaces through DEBUG without --debug", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--score"], { DEBUG: "vue-doctor:config" });
    expect(run.stderr).toContain("vue-doctor:config");
    expect(run.stderr).not.toContain("vue-doctor:env");
  });
});

describe("CLI in process: report files", () => {
  it("writes the deprecated --report HTML to a temp directory, never into the scanned project", async () => {
    const directory = copyFixture(BASIC_VUE_DIRECTORY);
    const before = fs.readdirSync(directory).sort();
    const run = await runCliInProcess([directory, ...FAST, "--report"]);
    expect(run.exitCode).toBe(0);
    expect(fs.readdirSync(directory).sort()).toEqual(before);
    expect(run.stderr).toContain("--report is deprecated");
    const target = /HTML report written to (.+vue-doctor-report\.html)/.exec(run.stderr)?.[1];
    expect(target).toBeDefined();
    expect(path.relative(directory, target!.trim()).startsWith("..")).toBe(true);
    expect(fs.readFileSync(target!.trim(), "utf-8")).toContain("<html");
  });

  it("appends a summary to GITHUB_STEP_SUMMARY with --github-summary", async () => {
    const summary = path.join(makeDirectory(), "summary.md");
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--github-summary"], { GITHUB_STEP_SUMMARY: summary });
    expect(run.exitCode).toBe(0);
    expect(fs.readFileSync(summary, "utf-8")).toContain("## 🩺 Vue Doctor:");
    expect(run.stderr).toContain("Written to GitHub Step Summary");
  });

  it("skips the summary when GITHUB_STEP_SUMMARY is not set", async () => {
    const run = await runCliInProcess([CLEAN_VUE_DIRECTORY, ...FAST, "--github-summary"], { GITHUB_STEP_SUMMARY: "" });
    expect(run.exitCode).toBe(0);
    expect(run.stderr).not.toContain("Step Summary");
  });
});

describe("CLI in process: usage errors (exit code 2)", () => {
  it.each([
    [["--fail-on", "sometimes"], "sometimes"],
    [["--min-score", "101"], "between 0 and 100"],
    [["--min-score", "abc"], "between 0 and 100"],
    [["--no-such-flag"], "unknown option"],
    [["--format", "xml"], "xml"],
  ])("rejects %j", async (flags, message) => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, ...flags]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain(message);
  });

  it("rejects --quiet together with --debug", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--quiet", "--debug"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("--quiet and --debug cannot be combined");
  });

  it("rejects --json together with another --format", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--json", "--format", "sarif"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("--json cannot be combined with --format sarif");
  });

  it("accepts --json together with --format json", async () => {
    const run = await runCliInProcess([CLEAN_VUE_DIRECTORY, ...FAST, "--json", "--format", "json"]);
    expect(run.exitCode).toBe(0);
  });

  it("rejects --output for the text format", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--output", "report.txt"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("--output requires --format json, jsonl, sarif, github, markdown or html");
  });

  it("exits 2 when the directory has no Vue dependency, and --force bypasses the check", async () => {
    const directory = makeDirectory();
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "plain", version: "1.0.0" }));
    fs.writeFileSync(path.join(directory, "index.ts"), "export const answer = 42;\n");

    const rejected = await runCliInProcess([directory, ...FAST, "--score"]);
    expect(rejected.exitCode).toBe(2);
    expect(rejected.stderr).toMatch(/vue/i);

    const forced = await runCliInProcess([directory, ...FAST, "--score", "--force"]);
    expect(forced.exitCode).toBe(0);
    expect(forced.stdout.trim()).toMatch(/^\d+$/);
  });

  it("exits 2 with a message for an invalid config file", async () => {
    const directory = copyFixture(CLEAN_VUE_DIRECTORY);
    fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), "{ not json");
    const run = await runCliInProcess([directory, ...FAST, "--score"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr.length).toBeGreaterThan(0);
  });

  it("exits 0 for --help and --version and prints them on stdout", async () => {
    const help = await runCliInProcess(["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("--fail-on");
    expect(help.stdout).toContain("baseline");

    const version = await runCliInProcess(["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("CLI in process: gating (exit codes 0 and 1)", () => {
  it("fails with 1 on --fail-on error and explains the breach", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--score", "--fail-on", "error"]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("✕");
  });

  it("fails with 1 when the score is below --min-score", async () => {
    const run = await runCliInProcess([BASIC_VUE_DIRECTORY, ...FAST, "--score", "--min-score", "100"]);
    expect(run.exitCode).toBe(1);
  });

  it("passes a clean project through every gate", async () => {
    const run = await runCliInProcess([CLEAN_VUE_DIRECTORY, ...FAST, "--score", "--fail-on", "warning", "--min-score", "100", "--strict"]);
    expect(run.exitCode).toBe(0);
  });

  it("takes gate settings from the project config; CLI flags win", async () => {
    const directory = copyFixture(BASIC_VUE_DIRECTORY);
    fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify({ gate: { failOn: "warning", minScore: 10 } }));

    expect((await runCliInProcess([directory, ...FAST, "--score"])).exitCode).toBe(1);
    expect((await runCliInProcess([directory, ...FAST, "--score", "--fail-on", "none", "--min-score", "0"])).exitCode).toBe(0);
  });

  it("takes verbose and analyzer toggles from the project config", async () => {
    const directory = copyFixture(BASIC_VUE_DIRECTORY);
    fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify({ verbose: true, lint: false, deadCode: false }));
    // Project checks are not part of `lint`; give the project a lockfile so only template rules can report.
    fs.writeFileSync(path.join(directory, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
    const run = await runCliInProcess([directory, "-y", "--no-cache", "--json"]);
    expect(run.exitCode).toBe(0);
    const report = JSON.parse(run.stdout) as JsonReport;
    // Template rules still run (only the oxlint "lint" analyzer is off), dead code is off.
    expect(report.projects[0].findings.every((finding) => !finding.ruleId.startsWith("knip/"))).toBe(true);
    expect(report.projects[0].findings.every((finding) => !finding.ruleId.startsWith("vue-doctor/"))).toBe(true);
  });
});

describe("CLI in process: dead code", () => {
  it("runs knip by default and reports unused files", async () => {
    const directory = copyFixture(BASIC_VUE_DIRECTORY);
    const run = await runCliInProcess([directory, "-y", "--no-cache", "--json", "--no-lint"]);
    expect(run.exitCode).toBe(0);
    const report = JSON.parse(run.stdout) as JsonReport;
    expect(report.projects[0].findings.some((finding) => finding.ruleId.startsWith("knip/"))).toBe(true);
  });
});

describe("CLI in process: --diff", () => {
  const createRepo = (): string => {
    const directory = copyFixture(CLEAN_VUE_DIRECTORY);
    git(directory, "init", "--quiet");
    git(directory, "symbolic-ref", "HEAD", "refs/heads/main");
    git(directory, "add", "-A");
    git(directory, "commit", "--quiet", "-m", "initial");
    return directory;
  };

  it("skips the project with exit 0 when no source files changed", async () => {
    const directory = createRepo();
    const run = await runCliInProcess([directory, ...FAST, "--diff"]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("nothing to scan");
    expect(run.stdout).toBe("");
  });

  it("scans only changed files and announces them", async () => {
    const directory = createRepo();
    fs.writeFileSync(
      path.join(directory, "Changed.vue"),
      `<script setup lang="ts">\nconst html = "<b>x</b>";\n</script>\n<template><div v-html="html" /></template>\n`,
    );
    const run = await runCliInProcess([directory, ...FAST, "--diff"]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("Scanning 1 changed files");
    expect(run.stdout).toContain("Score:");
  });

  it("scans changes against an explicit branch", async () => {
    const directory = createRepo();
    git(directory, "checkout", "--quiet", "-b", "feature");
    fs.writeFileSync(path.join(directory, "Feature.vue"), `<template><p>hi</p></template>\n`);
    git(directory, "add", "-A");
    git(directory, "commit", "--quiet", "-m", "feature");
    const run = await runCliInProcess([directory, ...FAST, "--diff", "main"]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("Scanning 1 changed files");
  });

  it("warns and falls back to a full scan outside a git repository", async () => {
    const directory = copyFixture(CLEAN_VUE_DIRECTORY);
    const run = await runCliInProcess([directory, ...FAST, "--diff"]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("--diff is unavailable");
    expect(run.stderr).toContain("FULL scan");
    expect(run.stdout).toContain("Score:");
  });

  it("honours diff: false in the config", async () => {
    const directory = createRepo();
    fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify({ diff: false }));
    const run = await runCliInProcess([directory, ...FAST]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).not.toContain("nothing to scan");
  });
});

describe("CLI in process: monorepos", () => {
  it("scans every workspace project into one JSON document with -y", async () => {
    const root = createMonorepo();
    temporaryDirectories.push(root);
    const run = await runCliInProcess([root, ...FAST, "--json"]);
    expect(run.exitCode).toBe(0);
    const report = JSON.parse(run.stdout) as JsonReport;
    expect(report.projects.map((project) => path.basename(project.root)).sort()).toEqual(["app-a", "app-b"]);
  });

  it("prints a banner and report per project in order for the text format", async () => {
    const root = createMonorepo();
    temporaryDirectories.push(root);
    const run = await runCliInProcess([root, ...FAST]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("@mono/app-a");
    expect(run.stderr.indexOf("@mono/app-a")).toBeLessThan(run.stderr.indexOf("@mono/app-b"));
    expect(run.stdout.match(/Score:/g)).toHaveLength(2);
  });

  it("scans only the project named by --project", async () => {
    const root = createMonorepo();
    temporaryDirectories.push(root);
    const run = await runCliInProcess([root, ...FAST, "--json", "--project", "app-b"]);
    expect(run.exitCode).toBe(0);
    const report = JSON.parse(run.stdout) as JsonReport;
    expect(report.projects).toHaveLength(1);
    expect(path.basename(report.projects[0].root)).toBe("app-b");
  });
});

describe("CLI in process: baseline", () => {
  it("records a baseline, then --baseline marks findings as known so --gate new passes", async () => {
    const directory = copyFixture(BASIC_VUE_DIRECTORY);
    const baselineFile = path.join(makeDirectory(), "baseline.json");

    const recorded = await runCliInProcess(["baseline", directory, "-y", "--output", baselineFile]);
    expect(recorded.exitCode).toBe(0);
    expect(recorded.stderr).toMatch(/Wrote \d+ findings to/);
    expect(fs.existsSync(baselineFile)).toBe(true);

    const gated = await runCliInProcess([directory, ...FAST, "--baseline", baselineFile, "--gate", "new", "--fail-on", "warning"]);
    expect(gated.exitCode).toBe(0);
    expect(gated.stderr).toContain("Baseline: 0 new");

    const ungated = await runCliInProcess([directory, ...FAST, "--baseline", baselineFile, "--fail-on", "warning"]);
    expect(ungated.exitCode).toBe(1);
  });

  it("writes <project>/vue-doctor-baseline.json by default and uses the singular noun for one finding", async () => {
    const directory = copyFixture(CLEAN_VUE_DIRECTORY);
    fs.writeFileSync(
      path.join(directory, "Bad.vue"),
      `<script setup lang="ts">\nconst html = "<b>x</b>";\n</script>\n<template><div v-html="html" /></template>\n`,
    );
    const run = await runCliInProcess(["baseline", directory, "-y"]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toMatch(/Wrote \d+ findings? to/);
    expect(fs.readdirSync(directory).some((name) => name.endsWith("baseline.json"))).toBe(true);
  });

  it("refuses --output for several projects", async () => {
    const root = createMonorepo();
    temporaryDirectories.push(root);
    const run = await runCliInProcess(["baseline", root, "-y", "--output", path.join(root, "b.json")]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("--output can only be used with a single project");
  });

  it("exits 2 for an unreadable baseline given to --baseline", async () => {
    const baselineFile = path.join(makeDirectory(), "baseline.json");
    fs.writeFileSync(baselineFile, "{ not json");
    const run = await runCliInProcess([CLEAN_VUE_DIRECTORY, ...FAST, "--baseline", baselineFile]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr.length).toBeGreaterThan(0);
  });
});
