import { OXLINT_RULES } from "../../src/plugin/registry.js";
import {
  loadBenchmarkInputs,
  loadFixtureInputs,
  loadFixtureTrees,
  loadFsRuleTrees,
  loadScriptRuleInputs,
  loadTemplateRuleInputs,
} from "./corpus.js";
import { runFsRulesInstrumented } from "./fs-engine.js";
import { mutateInput } from "./mutations.js";
import { OxlintTimeoutError, runOxlintInstrumented, type OxlintFile } from "./oxlint-engine.js";
import { createRandom, hashString } from "./prng.js";
import { buildStressInputs, buildStressTrees } from "./stress.js";
import { createTemplateLinter, type TemplateLinter } from "./template-engine.js";
import { composeTransforms, TRANSFORMS, TREE_TRANSFORMS, type Transform } from "./transforms.js";
import type { Failure, FuzzEngine, NormalizedFinding, RuleTiming, SourceInput, TreeInput } from "./types.js";

export interface FuzzOptions {
  mode: "smoke" | "full";
  seed: number;
  /** Random mutants per base input (crash and slowness oracles only). */
  mutants: number;
  /** Random two-transform compositions per base input, on top of every single transform. */
  compositions: number;
  /** Time budget of one rule on one file: `baseMs` plus `perKbMs` per KiB of input. */
  budget: { baseMs: number; perKbMs: number };
  /** Size factor of the synthetic stress inputs (1 is the full run). */
  stressScale: number;
  /** Per rule only its first valid and first invalid case (plus all fixtures): the fast subset. */
  subset: boolean;
  benchmarks: { enabled: boolean; limit: number };
  /** Restrict to these engines. */
  engines: readonly FuzzEngine[];
  /** Only report and run inputs/trees owned by this rule (debugging a single rule). */
  onlyRule?: string;
  log: (line: string) => void;
}

const SILENT = (): void => undefined;

export const SMOKE_OPTIONS: FuzzOptions = {
  mode: "smoke",
  seed: 1,
  mutants: 1,
  compositions: 0,
  // Generous: the smoke run shares the machine with the whole test suite, so only a real blow-up counts.
  budget: { baseMs: 1000, perKbMs: 20 },
  stressScale: 0.04,
  subset: true,
  benchmarks: { enabled: false, limit: 0 },
  engines: ["oxlint", "template", "fs"],
  log: SILENT,
};

export const FULL_OPTIONS: FuzzOptions = {
  mode: "full",
  seed: 1,
  mutants: 4,
  compositions: 1,
  // Rules cost well under 0.2 ms per KiB on realistic input; this leaves ten times that, plus noise headroom.
  budget: { baseMs: 100, perKbMs: 1 },
  stressScale: 1,
  subset: false,
  benchmarks: { enabled: true, limit: 150 },
  engines: ["oxlint", "template", "fs"],
  log: SILENT,
};

export interface FuzzStats {
  baseInputs: number;
  oxlintFiles: number;
  templateFiles: number;
  fsTrees: number;
  fsRuns: number;
  mutants: number;
  /** Mutants whose rules actually ran (the rest do not parse, so oxlint never calls a rule). */
  mutantsParsed: number;
  transformsApplied: number;
  /** Metamorphic comparisons made, and how many findings they covered (an oracle that compares nothing is vacuous). */
  comparisons: number;
  comparedFindings: number;
  /** Metamorphic comparisons that were skipped because the baseline or the rewritten input does not parse. */
  skippedUnparsable: number;
  skipped: { engine: FuzzEngine; input: string; variant: string }[];
  benchmarkRepositories: string[];
  oxlintRules: number;
}

export interface SlowRun {
  engine: FuzzEngine;
  rule: string;
  input: string;
  ms: number;
  kib: number;
}

export interface FuzzResult {
  failures: Failure[];
  stats: FuzzStats;
  /** The slowest (rule, input) runs of the baseline inputs, for context. */
  slowest: SlowRun[];
}

interface Entry {
  input: SourceInput;
  /** `baseline`, a transform id, or `mutation:<id>`. */
  variant: string;
  baselineIndex: number;
  lineMap?: (line: number) => number;
}

interface Outcome {
  findings: NormalizedFinding[];
  problems: string[];
  /** Per-rule time (oxlint only). */
  timings: RuleTiming[];
  /** Time of the whole file (template pass only). */
  wallMs?: number;
  crashes: { rule: string; message: string }[];
}

const OXLINT_CHUNK_SIZE = 1500;

const isVue = (filename: string): boolean => filename.endsWith(".vue");
const isScriptFile = (filename: string): boolean => /\.[cm]?[jt]sx?$/.test(filename);

const enginesOf = (input: SourceInput): readonly FuzzEngine[] => {
  if (input.engines) return input.engines;
  if (isVue(input.filename)) return ["oxlint", "template"];
  return isScriptFile(input.filename) ? ["oxlint"] : [];
};

const budgetMs = (options: FuzzOptions, bytes: number): number => options.budget.baseMs + (bytes / 1024) * options.budget.perKbMs;

const slowDetail = (ms: number, entry: Entry, limit: number): string =>
  `${ms.toFixed(0)} ms for ${(entry.input.code.length / 1024).toFixed(1)} KiB (budget ${limit.toFixed(0)} ms)`;

const truncate = (text: string, length = 500): string => (text.length > length ? `${text.slice(0, length)}...` : text);

const firstLines = (text: string, count = 4): string => text.split("\n").slice(0, count).join(" | ");

/** Keeps one valid and one invalid case per rule (and one of each template kind); everything else stays. */
const selectSubset = (inputs: SourceInput[]): SourceInput[] => {
  const taken = new Map<string, number>();
  const selected: SourceInput[] = [];
  for (const input of inputs) {
    if (input.origin !== "cases" && input.origin !== "template-cases") {
      selected.push(input);
      continue;
    }
    const kind = /:((?:template-)?(?:valid|invalid)):/.exec(input.id)?.[1] ?? "valid";
    const key = `${input.owner}|${input.origin}|${kind}`;
    if ((taken.get(key) ?? 0) >= 1) continue;
    taken.set(key, 1);
    selected.push(input);
  }
  return selected;
};

const selectTrees = (trees: TreeInput[]): TreeInput[] => {
  const taken = new Set<string>();
  return trees.filter((tree) => {
    if (tree.origin !== "cases") return true;
    const key = `${tree.owner}|${tree.id.split(":")[2]}`;
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
};

const buildEntries = (baseInputs: SourceInput[], options: FuzzOptions): Entry[] => {
  const entries: Entry[] = [];
  const byKind = (input: SourceInput): string => (isVue(input.filename) ? "vue" : "script");
  baseInputs.forEach((input) => {
    const random = createRandom(hashString(input.id) ^ options.seed);
    const baselineIndex = entries.length;
    entries.push({ input, variant: "baseline", baselineIndex });

    const transforms: Transform[] = [...TRANSFORMS];
    for (let index = 0; index < options.compositions; index++) {
      const first = random.pick(TRANSFORMS);
      const second = random.pick(TRANSFORMS);
      if (first.id !== second.id) transforms.push(composeTransforms(first, second));
    }
    for (const transform of transforms) {
      const result = transform.apply(input.code, input.filename);
      if (!result || result.code === input.code) continue;
      entries.push({ input: { ...input, code: result.code }, variant: transform.id, baselineIndex, lineMap: result.lineMap });
    }

    // Mutating the synthetic stress inputs only adds slow junk; they already probe the extremes.
    if (options.mutants > 0 && input.origin !== "stress") {
      const donors = baseInputs.filter((candidate) => byKind(candidate) === byKind(input));
      const donor = random.pick(donors).code;
      for (const mutant of mutateInput(input, random, options.mutants, donor)) {
        entries.push({ input: mutant, variant: mutant.mutation ?? "mutation", baselineIndex: entries.length });
      }
    }
  });
  return entries;
};

/** Runs entries through oxlint, grouped by the rule options their input needs, in chunks. */
const executeOxlint = async (entries: readonly Entry[], log: (line: string) => void): Promise<Map<Entry, Outcome>> => {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const { owner, ruleOptions } = entry.input;
    const key = owner && ruleOptions ? JSON.stringify([owner, ruleOptions]) : "";
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const outcomes = new Map<Entry, Outcome>();
  const toOutcome = (result: Awaited<ReturnType<typeof runOxlintInstrumented>>[number], entry: Entry): Outcome => ({
    findings: result.findings.map((finding) => ({ rule: finding.rule, file: entry.input.filename, line: finding.line, message: finding.message })),
    problems: result.problems,
    timings: result.timings,
    crashes: [
      ...result.timings.filter((timing) => timing.error).map((timing) => ({ rule: timing.rule, message: timing.error ?? "" })),
      ...result.hostErrors.map((message) => ({ rule: "*", message: `oxlint's JS plugin host failed, so no Vue Doctor finding is reported for the file: ${message}` })),
    ],
  });

  const failedOutcome = (rule: string, message: string): Outcome => ({ findings: [], problems: [], timings: [], crashes: [{ rule, message }] });

  const runOne = async (entry: Entry, ruleOptions: Record<string, Record<string, unknown>> | undefined): Promise<Outcome> => {
    const file: OxlintFile = { filename: entry.input.filename, code: entry.input.code };
    try {
      return toOutcome((await runOxlintInstrumented([file], { ruleOptions, timeoutMs: 60_000 }))[0], entry);
    } catch (error) {
      if (!(error instanceof OxlintTimeoutError)) return failedOutcome("*", `oxlint failed: ${truncate(String(error))}`);
      // A hang: find the rule by running the file once per rule.
      const hung: Outcome = { findings: [], problems: [], timings: [], crashes: [] };
      for (const rule of OXLINT_RULES) {
        try {
          await runOxlintInstrumented([file], { ruleOptions, onlyRules: [rule.ruleMeta.id], timeoutMs: 20_000 });
        } catch (ruleError) {
          if (ruleError instanceof OxlintTimeoutError) hung.crashes.push({ rule: rule.ruleMeta.id, message: "did not finish within 20 s (hang or runaway backtracking)" });
        }
      }
      if (hung.crashes.length === 0) hung.crashes.push({ rule: "*", message: "oxlint did not finish within 60 s on this file" });
      return hung;
    }
  };

  for (const group of groups.values()) {
    const first = group[0].input;
    const ruleOptions = first.owner && first.ruleOptions ? { [first.owner]: first.ruleOptions } : undefined;
    for (let start = 0; start < group.length; start += OXLINT_CHUNK_SIZE) {
      const chunk = group.slice(start, start + OXLINT_CHUNK_SIZE);
      log(`  oxlint: ${chunk.length} files${ruleOptions ? ` (options for ${first.owner})` : ""}`);
      try {
        const results = await runOxlintInstrumented(
          chunk.map((entry) => ({ filename: entry.input.filename, code: entry.input.code })),
          { ruleOptions },
        );
        chunk.forEach((entry, index) => outcomes.set(entry, toOutcome(results[index], entry)));
      } catch (error) {
        log(`  oxlint run failed (${truncate(String(error), 120)}); retrying file by file`);
        for (const entry of chunk) outcomes.set(entry, await runOne(entry, ruleOptions));
      }
    }
  }
  return outcomes;
};

const executeTemplate = async (entries: readonly Entry[], linter: TemplateLinter, log: (line: string) => void): Promise<Map<Entry, Outcome>> => {
  log(`  template: ${entries.length} files`);
  const outcomes = new Map<Entry, Outcome>();
  for (const entry of entries) {
    const result = await linter.lint({ filename: entry.input.filename, code: entry.input.code });
    outcomes.set(entry, {
      findings: result.findings.map((finding) => ({ rule: finding.rule, file: entry.input.filename, line: finding.line, message: finding.message })),
      problems: result.problems,
      timings: [],
      wallMs: result.ms,
      crashes: result.crash ? [result.crash] : [],
    });
  }
  return outcomes;
};

const findingKey = (finding: NormalizedFinding, line: number): string => `${finding.rule}\u0000${line}\u0000${finding.message}`;

/** Per rule, how the findings of a rewritten file differ from the original's (lines mapped), if they do. */
export const diffFindings = (
  baseline: readonly NormalizedFinding[],
  variant: readonly NormalizedFinding[],
  lineMap: (line: number) => number,
  ignoreRules: ReadonlySet<string>,
  ignoreLines = false,
): Map<string, string> => {
  const keyOf = (finding: NormalizedFinding, line: number): string => findingKey(finding, ignoreLines ? 0 : line);
  const counts = new Map<string, { rule: string; delta: number; example: string }>();
  const bump = (finding: NormalizedFinding, line: number, amount: number): void => {
    if (ignoreRules.has(finding.rule)) return;
    const key = keyOf(finding, line);
    const entry = counts.get(key) ?? { rule: finding.rule, delta: 0, example: `line ${line}: ${truncate(finding.message, 120)}` };
    entry.delta += amount;
    counts.set(key, entry);
  };
  for (const finding of baseline) bump(finding, lineMap(finding.line), -1);
  for (const finding of variant) bump(finding, finding.line, 1);

  const perRule = new Map<string, string[]>();
  for (const { rule, delta, example } of counts.values()) {
    if (delta === 0) continue;
    const label = delta < 0 ? `lost (expected but not reported): ${example}` : `new (reported only after the rewrite): ${example}`;
    perRule.set(rule, [...(perRule.get(rule) ?? []), label]);
  }
  return new Map([...perRule].map(([rule, lines]) => [rule, truncate(lines.slice(0, 3).join("; "), 700)]));
};

export const runFuzz = async (options: FuzzOptions): Promise<FuzzResult> => {
  const { log } = options;
  const failures: Failure[] = [];
  const seen = new Set<string>();
  const addFailure = (failure: Failure): void => {
    if (options.onlyRule && failure.rule !== options.onlyRule && failure.rule !== "*") return;
    const key = JSON.stringify([failure.oracle, failure.engine, failure.rule, failure.input, failure.variant]);
    if (seen.has(key)) return;
    seen.add(key);
    failures.push(failure);
  };
  const stats: FuzzStats = {
    baseInputs: 0,
    oxlintFiles: 0,
    templateFiles: 0,
    fsTrees: 0,
    fsRuns: 0,
    mutants: 0,
    mutantsParsed: 0,
    transformsApplied: 0,
    comparisons: 0,
    comparedFindings: 0,
    skippedUnparsable: 0,
    skipped: [],
    benchmarkRepositories: [],
    oxlintRules: OXLINT_RULES.length,
  };
  const slowRuns: SlowRun[] = [];

  // ---- Corpus -------------------------------------------------------------------------------
  log("Building corpus");
  const benchmarkRandom = createRandom(options.seed);
  let sources = [...(await loadScriptRuleInputs()), ...loadTemplateRuleInputs(), ...loadFixtureInputs()];
  if (options.subset) sources = selectSubset(sources);
  if (options.onlyRule) sources = sources.filter((input) => input.owner === undefined || input.owner === options.onlyRule);
  if (options.benchmarks.enabled) {
    const benchmark = loadBenchmarkInputs(benchmarkRandom, options.benchmarks.limit);
    stats.benchmarkRepositories = benchmark.repositories;
    sources.push(...benchmark.inputs);
  }
  const baseInputs = [...sources, ...buildStressInputs(options.stressScale)];
  stats.baseInputs = baseInputs.length;

  const entries = buildEntries(baseInputs, options);
  stats.mutants = entries.filter((entry) => entry.variant.startsWith("mutation:")).length;
  stats.transformsApplied = entries.filter((entry) => entry.variant !== "baseline" && !entry.variant.startsWith("mutation:")).length;

  // ---- Script and template engines -----------------------------------------------------------
  const outcomesByEngine = new Map<FuzzEngine, Map<Entry, Outcome>>();
  const wantsEngine = (engine: FuzzEngine): boolean => options.engines.includes(engine);

  if (wantsEngine("oxlint")) {
    const subset = entries.filter((entry) => enginesOf(entry.input).includes("oxlint"));
    stats.oxlintFiles = subset.length;
    log(`Running ${subset.length} files through oxlint (${OXLINT_RULES.length} rules)`);
    outcomesByEngine.set("oxlint", await executeOxlint(subset, log));
  }
  let linter: TemplateLinter | undefined;
  if (wantsEngine("template")) {
    linter = await createTemplateLinter();
    const subset = entries.filter((entry) => enginesOf(entry.input).includes("template"));
    stats.templateFiles = subset.length;
    log(`Running ${subset.length} files through the template pass`);
    outcomesByEngine.set("template", await executeTemplate(subset, linter, log));
  }

  // ---- Oracles on the script and template engines ----------------------------------------------
  for (const [engine, outcomes] of outcomesByEngine) {
    const slowCandidates: Entry[] = [];

    const baselines = new Map<number, Outcome>();
    for (const [entry, outcome] of outcomes) if (entry.variant === "baseline") baselines.set(entry.baselineIndex, outcome);

    for (const [entry, outcome] of outcomes) {
      const { input, variant } = entry;
      if (engine === "oxlint" && variant.startsWith("mutation:") && outcome.problems.length === 0) stats.mutantsParsed++;
      for (const crash of outcome.crashes) {
        addFailure({ oracle: "crash", engine, rule: crash.rule, input: input.id, variant, detail: truncate(firstLines(crash.message, 5)) });
      }
      const limit = budgetMs(options, input.code.length);
      // oxlint rules are timed one by one; the template pass is timed as a whole and attributed to rules only when over budget.
      const units: RuleTiming[] = engine === "template" ? [{ rule: "*", file: input.filename, ms: outcome.wallMs ?? 0 }] : outcome.timings;
      if (units.some((timing) => timing.ms > limit)) slowCandidates.push(entry);
      if (variant === "baseline") {
        for (const timing of units) slowRuns.push({ engine, rule: timing.rule, input: input.id, ms: timing.ms, kib: input.code.length / 1024 });
      }

      if (variant === "baseline" || variant.startsWith("mutation:") || !entry.lineMap) continue;
      const baseline = baselines.get(entry.baselineIndex);
      if (!baseline) continue;
      // Neither file may fail to parse, and a rule that threw in either has nothing to compare.
      // A host failure (rule "*") loses every finding of the file, so there is nothing to compare either.
      const hostFailed = [...baseline.crashes, ...outcome.crashes].some((crash) => crash.rule === "*");
      if (baseline.problems.length > 0 || outcome.problems.length > 0 || hostFailed) {
        stats.skippedUnparsable++;
        if (stats.skipped.length < 20) stats.skipped.push({ engine, input: input.id, variant });
        continue;
      }
      stats.comparisons++;
      stats.comparedFindings += baseline.findings.length;
      const crashed = new Set([...baseline.crashes, ...outcome.crashes].map((crash) => crash.rule));
      for (const [rule, detail] of diffFindings(baseline.findings, outcome.findings, entry.lineMap, crashed)) {
        addFailure({ oracle: "metamorphic", engine, rule, input: input.id, variant, detail });
      }
    }

    // Timing noise: only a candidate that is over budget again when re-run is reported. A variant
    // of an input whose baseline is already over budget adds nothing: the baseline reports it.
    const isBaselineSlow = (entry: Entry): boolean => slowCandidates.some((candidate) => candidate.variant === "baseline" && candidate.baselineIndex === entry.baselineIndex);
    const toConfirm = slowCandidates.filter((entry) => entry.variant === "baseline" || entry.variant.startsWith("mutation:") || !isBaselineSlow(entry));
    if (toConfirm.length > 0) {
      log(`  re-running ${toConfirm.length} over-budget ${engine} files to confirm`);
      if (engine === "oxlint") {
        const rerun = await executeOxlint(toConfirm, log);
        for (const entry of toConfirm) {
          const limit = budgetMs(options, entry.input.code.length);
          for (const timing of outcomes.get(entry)?.timings ?? []) {
            const again = rerun.get(entry)?.timings.find((candidate) => candidate.rule === timing.rule);
            if (timing.ms <= limit || !again || again.ms <= limit) continue;
            addFailure({ oracle: "slowness", engine, rule: timing.rule, input: entry.input.id, variant: entry.variant, detail: slowDetail(Math.min(timing.ms, again.ms), entry, limit) });
          }
        }
      } else {
        const templateLinter = linter as TemplateLinter;
        for (const entry of toConfirm) {
          const limit = budgetMs(options, entry.input.code.length);
          const file = { filename: entry.input.filename, code: entry.input.code };
          // eslint-plugin-vue walks the template once for every rule, so find which rule the time belongs to.
          const isolation = await templateLinter.isolate(file).catch(() => undefined);
          if (!isolation) continue;
          // The first pass only nominates: parse time on a large file varies by about as much as the
          // budget, so a rule is reported only when a second, paired measurement is over budget too.
          const attempts = entry.input.code.length > 50 * 1024 ? 5 : 3;
          const candidates = isolation.rules.filter((timing) => timing.ms > limit).map((timing) => timing.rule);
          const excess = isolation.fullMs - isolation.parseMs;
          const wantsSpread = candidates.length === 0 && excess > limit;
          if (candidates.length === 0 && !wantsSpread) continue;
          const second = await templateLinter.confirm(file, wantsSpread ? ["*"] : candidates, attempts).catch(() => undefined);
          if (!second) continue;
          for (const timing of second.rules) {
            if (timing.ms <= limit) continue;
            if (timing.rule === "*") {
              addFailure({ oracle: "slowness", engine, rule: "*", input: entry.input.id, variant: entry.variant, detail: `${slowDetail(timing.ms, entry, limit)}, spread over many rules (parsing alone takes ${second.parseMs.toFixed(0)} ms)` });
            } else {
              addFailure({ oracle: "slowness", engine, rule: timing.rule, input: entry.input.id, variant: entry.variant, detail: `${slowDetail(timing.ms, entry, limit)} on top of ${second.parseMs.toFixed(0)} ms parsing` });
            }
          }
        }
      }
    }
  }

  // ---- Filesystem rules ---------------------------------------------------------------------------
  if (wantsEngine("fs")) {
    let trees = [...(await loadFsRuleTrees()), ...loadFixtureTrees()];
    if (options.subset) trees = selectTrees(trees);
    if (options.onlyRule) trees = trees.filter((tree) => tree.owner === undefined || tree.owner === options.onlyRule);
    trees = [...trees, ...buildStressTrees(options.stressScale)];
    stats.fsTrees = trees.length;
    log(`Running ${trees.length} file trees through the filesystem rules`);

    for (const tree of trees) {
      const bytes = Object.values(tree.files).reduce((total, content) => total + content.length, 0);
      const limit = budgetMs(options, bytes);
      const run = (candidate: TreeInput): ReturnType<typeof runFsRulesInstrumented> => {
        stats.fsRuns++;
        return runFsRulesInstrumented(candidate);
      };
      const baseline = run(tree);
      for (const outcome of baseline) {
        if (outcome.error) addFailure({ oracle: "crash", engine: "fs", rule: outcome.rule, input: tree.id, variant: "baseline", detail: truncate(firstLines(outcome.error, 5)) });
        if (outcome.ms > limit) {
          const again = run(tree).find((candidate) => candidate.rule === outcome.rule);
          if (again && again.ms > limit) {
            addFailure({ oracle: "slowness", engine: "fs", rule: outcome.rule, input: tree.id, variant: "baseline", detail: `${Math.min(outcome.ms, again.ms).toFixed(0)} ms for ${(bytes / 1024).toFixed(1)} KiB (budget ${limit.toFixed(0)} ms)` });
          }
        }
        slowRuns.push({ engine: "fs", rule: outcome.rule, input: tree.id, ms: outcome.ms, kib: bytes / 1024 });
      }

      for (const transform of TREE_TRANSFORMS) {
        const result = transform.apply(tree);
        if (!result) continue;
        stats.transformsApplied++;
        const variant = run(result.tree);
        for (const [index, outcome] of variant.entries()) {
          const reference = baseline[index];
          if (outcome.error) {
            if (!reference.error) addFailure({ oracle: "crash", engine: "fs", rule: outcome.rule, input: tree.id, variant: transform.id, detail: truncate(firstLines(outcome.error, 5)) });
            continue;
          }
          if (reference.error) continue;
          const asFindings = (found: typeof outcome.findings): NormalizedFinding[] => found.map((item) => ({ rule: outcome.rule, file: item.file, line: item.line, message: `${item.file}: ${item.message}` }));
          const differences = diffFindings(asFindings(reference.findings), asFindings(outcome.findings), (line) => line, new Set(), !result.linesStable);
          for (const [rule, detail] of differences) {
            addFailure({ oracle: "metamorphic", engine: "fs", rule, input: tree.id, variant: transform.id, detail });
          }
        }
      }
    }
  }

  const slowest = slowRuns.sort((a, b) => b.ms - a.ms).slice(0, 15);
  return { failures, stats, slowest };
};

