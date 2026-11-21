import type { FuzzOptions, FuzzResult } from "./run.js";
import type { KnownFailure, TriagedFailures } from "./known-failures.js";
import type { Failure } from "./types.js";

export interface FailureGroup {
  oracle: Failure["oracle"];
  engine: Failure["engine"];
  rule: string;
  variant: string;
  count: number;
  examples: Failure[];
}

/** One group per (oracle, engine, rule, variant), so a rule that fails on 60 inputs reads as one line. */
export const groupFailures = (failures: readonly Failure[]): FailureGroup[] => {
  const groups = new Map<string, FailureGroup>();
  for (const failure of failures) {
    // Mutation variants are grouped as one kind of rewrite, not per mutator.
    const variant = failure.variant.startsWith("mutation:") ? "mutation" : failure.variant;
    const key = [failure.oracle, failure.engine, failure.rule, variant].join("|");
    const group = groups.get(key) ?? { oracle: failure.oracle, engine: failure.engine, rule: failure.rule, variant, count: 0, examples: [] };
    group.count++;
    if (group.examples.length < 3) group.examples.push(failure);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => a.oracle.localeCompare(b.oracle) || a.rule.localeCompare(b.rule) || a.variant.localeCompare(b.variant),
  );
};

const renderGroup = (group: FailureGroup, indent: string): string[] => [
  `${indent}${group.oracle} / ${group.engine} / ${group.rule} / ${group.variant}: ${group.count} input${group.count === 1 ? "" : "s"}`,
  ...group.examples.map((example) => `${indent}    ${example.input}${example.variant === group.variant ? "" : ` [${example.variant}]`}\n${indent}      ${example.detail}`),
];

export const renderText = (result: FuzzResult, triaged: TriagedFailures, options: FuzzOptions, seconds: number): string => {
  const { stats } = result;
  const lines = [
    `Rule fuzzing (${options.mode}, seed ${options.seed}) finished in ${seconds.toFixed(1)} s`,
    `  inputs: ${stats.baseInputs} base, ${stats.mutants} mutants (${stats.mutantsParsed} of them parse and reach the rules), ${stats.transformsApplied} rewrites`,
    `  runs: ${stats.oxlintFiles} oxlint files (${stats.oxlintRules} rules), ${stats.templateFiles} template files, ${stats.fsTrees} file trees (${stats.fsRuns} runs)`,
    `  metamorphic comparisons: ${stats.comparisons} made over ${stats.comparedFindings} baseline findings; ${stats.skippedUnparsable} skipped because an input does not parse`,
    ...stats.skipped.slice(0, 5).map((skipped) => `    skipped: ${skipped.engine} ${skipped.input} [${skipped.variant}]`),
    `  benchmark repositories: ${stats.benchmarkRepositories.length > 0 ? stats.benchmarkRepositories.join(", ") : "none cached (not required)"}`,
    "  slowest rule runs (baseline inputs):",
    ...result.slowest.slice(0, 12).map((run) => `    ${run.ms.toFixed(1)} ms for ${run.kib.toFixed(1)} KiB  ${run.engine}/${run.rule}  ${run.input}`),
    "",
    `Failures: ${triaged.unexpected.length} new, ${triaged.known.length} known (allowlisted)`,
  ];
  const unexpected = groupFailures(triaged.unexpected);
  if (unexpected.length > 0) {
    lines.push("", "NEW FAILURES (fix the rule, or add a reasoned entry to tests/fuzz/known-failures.json):");
    for (const group of unexpected) lines.push(...renderGroup(group, "  "));
  }
  const known = groupFailures(triaged.known);
  if (known.length > 0) {
    lines.push("", "Known failures (tests/fuzz/known-failures.json):");
    for (const group of known) lines.push(`  ${group.oracle} / ${group.engine} / ${group.rule} / ${group.variant}: ${group.count}`);
  }
  if (triaged.stale.length > 0) {
    lines.push("", "Allowlist entries that matched nothing in this run (fixed? remove them, or this run was a subset):");
    for (const entry of triaged.stale) lines.push(`  ${entry.oracle} / ${entry.engine ?? "*"} / ${entry.rule} / ${entry.variant ?? "*"} / ${entry.input ?? "*"}`);
  }
  return `${lines.join("\n")}\n`;
};

export const renderMarkdown = (result: FuzzResult, triaged: TriagedFailures, options: FuzzOptions, seconds: number): string => {
  const { stats } = result;
  const lines = [
    `### Rule fuzzing (${options.mode}, seed ${options.seed})`,
    "",
    `${stats.baseInputs} base inputs, ${stats.mutants} mutants and ${stats.transformsApplied} rewrites through ${stats.oxlintFiles} oxlint files, ${stats.templateFiles} template files and ${stats.fsTrees} file trees in ${seconds.toFixed(0)} s.`,
    "",
    `**${triaged.unexpected.length} new failures**, ${triaged.known.length} known (allowlisted).`,
  ];
  const table = (groups: FailureGroup[]): string[] => [
    "",
    "| Oracle | Engine | Rule | Variant | Inputs | Example |",
    "| --- | --- | --- | --- | --- | --- |",
    ...groups.map((group) => `| ${group.oracle} | ${group.engine} | \`${group.rule}\` | ${group.variant} | ${group.count} | \`${group.examples[0].input.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")}\` |`),
  ];
  const unexpected = groupFailures(triaged.unexpected);
  if (unexpected.length > 0) lines.push("", "#### New failures", ...table(unexpected));
  const known = groupFailures(triaged.known);
  if (known.length > 0) lines.push("", "<details><summary>Known failures</summary>", ...table(known), "", "</details>");
  if (triaged.stale.length > 0) lines.push("", `${triaged.stale.length} allowlist entries matched nothing in this run.`);
  return `${lines.join("\n")}\n`;
};

/** A starting point for the allowlist: one entry per group of unexpected failures, reasons to be written. */
export const suggestAllowlist = (failures: readonly Failure[]): KnownFailure[] =>
  groupFailures(failures).map((group) => ({
    oracle: group.oracle,
    engine: group.engine,
    rule: group.rule,
    variant: group.variant === "mutation" ? "mutation:*" : group.variant,
    reason: "TODO: say what is wrong and where it should be fixed",
  }));
