import fs from "node:fs";
import { parseArgs } from "node:util";
import { loadKnownFailures, triageFailures } from "./known-failures.js";
import { renderMarkdown, renderText, suggestAllowlist } from "./report.js";
import { FULL_OPTIONS, SMOKE_OPTIONS, runFuzz, type FuzzOptions } from "./run.js";
import type { FuzzEngine } from "./types.js";

const USAGE = `Usage: npm run fuzz --workspace=@remylagerweij/vue-doctor -- [options]

Fuzzes every registered own rule (oxlint, project-file) and template rule. Oracles: no rule
throws, no rule is slow, and semantics-preserving rewrites do not change findings.
Needs a build (the built plugin is what oxlint loads): npm run build first.

  --seed <n|random>     Seed of the random mutations and compositions (default: 1; the seed is always printed)
  --smoke               The small deterministic subset that also runs in the normal test suite
  --mutants <n>         Random mutants per input (default: ${FULL_OPTIONS.mutants})
  --compositions <n>    Random pairs of rewrites per input (default: ${FULL_OPTIONS.compositions})
  --stress-scale <x>    Size factor of the synthetic stress inputs (default: 1)
  --budget-ms <n>       Time budget of one rule on one file, before the per-KiB allowance (default: ${FULL_OPTIONS.budget.baseMs})
  --engine <name>       Only oxlint, template or fs (repeatable)
  --rule <id>           Only inputs written for this rule (debugging), e.g. no-eval
  --no-benchmarks       Ignore cached benchmark repositories (they are used when already fetched, never downloaded)
  --report <file>       Also write the markdown report to this file
  --strict-allowlist    Fail on allowlist entries that matched nothing (use with a full run)
  --print-allowlist     Print a skeleton of allowlist entries for the new failures
  -h, --help            Show this help
`;

const main = async (): Promise<number> => {
  const { values } = parseArgs({
    options: {
      seed: { type: "string" },
      smoke: { type: "boolean" },
      mutants: { type: "string" },
      compositions: { type: "string" },
      "stress-scale": { type: "string" },
      "budget-ms": { type: "string" },
      engine: { type: "string", multiple: true },
      rule: { type: "string" },
      "no-benchmarks": { type: "boolean" },
      report: { type: "string" },
      "strict-allowlist": { type: "boolean" },
      "print-allowlist": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const number = (name: string, raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name} needs a non-negative number, got "${raw}"`);
    return parsed;
  };

  const base = values.smoke ? SMOKE_OPTIONS : FULL_OPTIONS;
  const seed = values.seed === "random" ? Math.floor(Math.random() * 2 ** 31) : number("seed", values.seed, base.seed);
  const engines = (values.engine ?? base.engines) as FuzzEngine[];
  for (const engine of engines) {
    if (!["oxlint", "template", "fs"].includes(engine)) throw new Error(`--engine must be oxlint, template or fs, got "${engine}"`);
  }
  const options: FuzzOptions = {
    ...base,
    seed,
    mutants: number("mutants", values.mutants, base.mutants),
    compositions: number("compositions", values.compositions, base.compositions),
    stressScale: number("stress-scale", values["stress-scale"], base.stressScale),
    budget: { ...base.budget, baseMs: number("budget-ms", values["budget-ms"], base.budget.baseMs) },
    benchmarks: { ...base.benchmarks, enabled: base.benchmarks.enabled && !values["no-benchmarks"] },
    engines,
    onlyRule: values.rule,
    log: (line) => process.stderr.write(`${line}\n`),
  };

  const started = performance.now();
  const result = await runFuzz(options);
  const seconds = (performance.now() - started) / 1000;
  const triaged = triageFailures(result.failures, loadKnownFailures());

  process.stdout.write(renderText(result, triaged, options, seconds));
  if (values.report) fs.writeFileSync(values.report, renderMarkdown(result, triaged, options, seconds));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(result, triaged, options, seconds));
  if (values["print-allowlist"]) process.stdout.write(`${JSON.stringify({ knownFailures: suggestAllowlist(triaged.unexpected) }, null, 2)}\n`);

  const staleFails = values["strict-allowlist"] && triaged.stale.length > 0;
  return triaged.unexpected.length > 0 || staleFails ? 1 : 0;
};

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(2);
  },
);
