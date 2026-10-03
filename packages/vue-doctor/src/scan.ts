import { availableParallelism } from "node:os";
import path from "node:path";
import pc from "picocolors";
import { MILLISECONDS_PER_SECOND, PERFECT_SCORE, SCORE_BAR_WIDTH_CHARS } from "./constants.js";
import {
  diagnose,
  NoVueDependencyError,
  type AnalyzerName,
  type DiagnoseOptions,
  type DiagnoseResult,
} from "./core/diagnose.js";
import type { Diagnostic, ScanOptions } from "./types.js";
import { colorizeByScore } from "./utils/colorize-by-score.js";
import { discoverProject, formatFrameworkName } from "./utils/discover-project.js";
import { createFramedLine, printFramedBox, type FramedLine } from "./utils/framed-box.js";
import { groupBy } from "./utils/group-by.js";
import { highlighter } from "./utils/highlighter.js";
import { logger, output } from "./utils/logger.js";
import { mapWithConcurrency } from "./utils/map-with-concurrency.js";
import { createBatchProgressReporter, createProgressReporter, isAnimatedOutput } from "./utils/progress.js";
import { createKnipSession } from "./utils/run-knip.js";

const printProjectDetection = (
  projectInfo: ReturnType<typeof discoverProject>,
  isDiffMode: boolean,
  includePaths: string[],
): void => {
  const lines: FramedLine[] = [];

  const title = `${pc.bold(pc.green("Vue Doctor"))} ${pc.dim("v" + (process.env.VERSION ?? "0.0.1"))}`;
  lines.push(createFramedLine(`Vue Doctor v${process.env.VERSION ?? "0.0.1"}`, title));

  const vueVersionDisplay = projectInfo.vueVersion
    ? `Vue ${projectInfo.vueVersion}`
    : "Vue";
  const frameworkDisplay = formatFrameworkName(projectInfo.framework);
  const projectLine = `${projectInfo.projectName} · ${frameworkDisplay} · ${vueVersionDisplay}`;
  lines.push(createFramedLine(projectLine, pc.dim(projectLine)));

  if (projectInfo.hasTypeScript) {
    const tsLine = "TypeScript enabled";
    lines.push(createFramedLine(tsLine, pc.dim(tsLine)));
  }

  if (isDiffMode) {
    const diffLine = `Scanning ${includePaths.length} changed files`;
    lines.push(createFramedLine(diffLine, pc.yellow(diffLine)));
  } else {
    const countLine = `${projectInfo.sourceFileCount} source files`;
    lines.push(createFramedLine(countLine, pc.dim(countLine)));
  }

  printFramedBox(lines);
  logger.break();
};

const printScoreGauge = (score: number): void => {
  const filledWidth = Math.round((score / PERFECT_SCORE) * SCORE_BAR_WIDTH_CHARS);
  const emptyWidth = SCORE_BAR_WIDTH_CHARS - filledWidth;

  const filled = colorizeByScore("█".repeat(filledWidth), score);
  const empty = pc.dim("░".repeat(emptyWidth));
  const scoreLabel = colorizeByScore(`${score}`, score);
  const maxLabel = pc.dim(`/${PERFECT_SCORE}`);

  output.line(`  ${filled}${empty} ${scoreLabel}${maxLabel}`);
};

/** Number of "fixing X gains +N" hints shown in the text output (the JSON report lists all). */
const IMPACT_HINT_COUNT = 3;

const SCORE_CAP_NOTES = {
  "security-error": "a high-confidence security error",
  "critical-secret": "a critical secret",
} as const;

const pluralize = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Cap notice, one compact sub-score line per category (worst first) and the top impact hints. */
const printScoreBreakdown = (result: DiagnoseResult): void => {
  const { scoreCap, categoryScores, impact } = result;
  if (scoreCap) {
    output.line(
      `  ${pc.dim(`Capped at ${scoreCap.value} (would be ${result.rawScore}) because of ${SCORE_CAP_NOTES[scoreCap.reason]}: ${scoreCap.ruleId}`)}`,
    );
  }
  if (categoryScores.length > 0) {
    output.break();
    const nameWidth = Math.max(...categoryScores.map((entry) => entry.category.length));
    for (const entry of categoryScores) {
      const counts = [
        entry.errors > 0 ? pluralize(entry.errors, "error") : null,
        entry.warnings > 0 ? pluralize(entry.warnings, "warning") : null,
      ].filter(Boolean);
      output.line(
        `  ${entry.category.padEnd(nameWidth)}  ${colorizeByScore(String(entry.score).padStart(3), entry.score)}  ${pc.dim(counts.join(", "))}`,
      );
    }
  }
  if (impact.length > 0) {
    output.break();
    for (const { ruleId, gain } of impact.slice(0, IMPACT_HINT_COUNT)) {
      output.line(`  ${pc.dim(`Fixing ${ruleId} gains +${gain}`)}`);
    }
  }
};

const printDiagnosticsSummary = (
  diagnostics: Diagnostic[],
  verbose: boolean,
): void => {
  if (diagnostics.length === 0) {
    output.line(highlighter.success("  ✓ No issues found!"));
    return;
  }

  // The score breakdown above already lists each category with its counts; the per-rule
  // detail below is only for --verbose.
  if (verbose) {
    const byCategory = groupBy(diagnostics, (diagnostic) => diagnostic.category);
    for (const [category, categoryDiagnostics] of byCategory) {
      const errorCount = categoryDiagnostics.filter((d) => d.severity === "error").length;
      const warningCount = categoryDiagnostics.filter((d) => d.severity === "warning").length;

      const parts: string[] = [];
      if (errorCount > 0) parts.push(highlighter.error(`${errorCount} error${errorCount > 1 ? "s" : ""}`));
      if (warningCount > 0) parts.push(highlighter.warn(`${warningCount} warning${warningCount > 1 ? "s" : ""}`));

      output.line(`  ${pc.bold(category)}: ${parts.join(", ")}`);

      const byRule = groupBy(categoryDiagnostics, (d) => `${d.plugin}/${d.rule}`);
      for (const [_ruleKey, ruleDiagnostics] of byRule) {
        const firstDiag = ruleDiagnostics[0];
        const icon = firstDiag.severity === "error" ? highlighter.error("✕") : highlighter.warn("△");
        output.line(`    ${icon} ${firstDiag.message} ${pc.dim(`(×${ruleDiagnostics.length})`)}`);

        if (firstDiag.help) {
          output.line(`      ${pc.dim("→ " + firstDiag.help)}`);
        }

        // Show up to 3 affected files
        const filesByCount = groupBy(ruleDiagnostics, (d) => d.filePath);
        let shown = 0;
        for (const [filePath, _fileDiags] of filesByCount) {
          if (shown >= 3) {
            const remaining = filesByCount.size - 3;
            if (remaining > 0) {
              output.line(`      ${pc.dim(`... and ${remaining} more file${remaining > 1 ? "s" : ""}`)}`);
            }
            break;
          }
          output.line(`      ${pc.dim(filePath)}`);
          shown++;
        }
      }
    }
  }

  if (!verbose && diagnostics.length > 0) {
    logger.break();
    logger.log(`  ${pc.dim("💡 Tip: Run with ")}${pc.bold("--verbose")}${pc.dim(" to see findings per rule and file, or ")}${pc.bold("--format json")}${pc.dim(" for machine-readable output.")}`);
  }
};

const ANALYZER_LABELS: Record<AnalyzerName, string> = {
  lint: "lint checks",
  template: "template checks",
  "dead-code": "dead code checks",
  project: "project checks",
  audit: "dependency audit",
};

export interface ScanOutcome extends DiagnoseResult {
  /** The scanned project directory; the caller needs it to build the machine-readable report. */
  directory: string;
}

const printSkippedWarning = (skipped: DiagnoseResult["skipped"]): void => {
  if (skipped.length === 0) return;
  const noun = skipped.length === 1 ? "analyzer" : "analyzers";
  logger.warn(`  ⚠ ${skipped.length} ${noun} did not run — the results and score are incomplete:`);
  for (const entry of skipped) {
    // The first line is the message; stack traces and tool output are in --debug.
    const summary = entry.reason.split(/\r?\n/, 1)[0];
    logger.warn(`    • ${ANALYZER_LABELS[entry.analyzer]}: ${summary}`);
  }
  logger.warn("    Use --strict to fail the run (exit code 3) when this happens.");
};

const printTimings = (timings: Record<string, number>): void => {
  const { total, ...analyzers } = timings;
  const parts = Object.entries(analyzers).map(([name, durationMs]) => `${name} ${durationMs}ms`);
  logger.log(`  Timings: ${[...parts, `total ${total}ms`].join(", ")}`);
};

/** Text output (banner, progress, report); `--json`/`--format` and `--score` print nothing of it. */
const isInteractive = (options: ScanOptions): boolean => !options.json && !options.scoreOnly;

const analyzeProject = async (
  directory: string,
  options: ScanOptions,
  hooks: Pick<DiagnoseOptions, "onProgress" | "onDebug" | "knipSession">,
): Promise<ScanOutcome> => {
  const result = await diagnose(directory, {
    lint: options.lint,
    deadCode: options.deadCode,
    includePaths: options.includePaths ?? [],
    force: options.force,
    config: options.config,
    baseline: options.baseline,
    offline: options.offline,
    audit: options.audit,
    cache: options.cache,
    ...hooks,
  });
  return { ...result, directory };
};

/** Prints everything about a finished scan: report files, score, findings, status footer. */
const renderOutcome = async (outcome: ScanOutcome, options: ScanOptions): Promise<void> => {
  const { directory: _directory, ...result } = outcome;
  // Status output goes to stderr, so it is safe in every mode (also --json and --score).
  const printStatusFooter = (): void => {
    if (options.timings) printTimings(result.timings);
    printSkippedWarning(result.skipped);
  };

  const { diagnostics, score, label, timings } = result;
  const elapsed = (timings.total / MILLISECONDS_PER_SECOND).toFixed(1);

  if (options.json) {
    // The CLI renders structured output (json/jsonl) once for all projects, so multi-project
    // runs stay a single document.
    printStatusFooter();
    return;
  }

  if (options.scoreOnly) {
    output.line(String(score));
    printStatusFooter();
    return;
  }

  output.break();
  printScoreGauge(score);
  output.break();
  output.line(
    `  ${pc.bold("Score:")} ${colorizeByScore(String(score), score)} — ${colorizeByScore(label, score)}`,
  );
  output.line(`  ${pc.dim(`Completed in ${elapsed}s`)}`);
  printScoreBreakdown(result);
  output.break();
  printDiagnosticsSummary(diagnostics, options.verbose ?? false);
  output.break();

  if (result.suppressed.count > 0) {
    const noun = result.suppressed.count === 1 ? "finding" : "findings";
    logger.log(
      `  ${pc.dim(`${result.suppressed.count} ${noun} suppressed by vue-doctor-disable comments`)}`,
    );
    logger.break();
  }

  if (result.baseline) {
    const { matched, fixed } = result.baseline;
    const fixedText = fixed === null ? "" : `, ${fixed} fixed`;
    logger.log(`  ${pc.dim(`Baseline: ${result.baseline.new} new, ${matched} known${fixedText}`)}`);
    logger.break();
  }

  printStatusFooter();
};

export const scan = async (
  directory: string,
  options: ScanOptions = {},
): Promise<ScanOutcome> => {
  const includePaths = options.includePaths ?? [];
  const isInteractiveOutput = isInteractive(options);

  if (isInteractiveOutput) {
    const projectInfo = discoverProject(directory);
    if (!projectInfo.vueVersion && !options.force) {
      throw new NoVueDependencyError(directory);
    }
    printProjectDetection(projectInfo, includePaths.length > 0, includePaths);
  }

  const outcome = await analyzeProject(directory, options, {
    onProgress: isInteractiveOutput
      ? await createProgressReporter({ labels: ANALYZER_LABELS, animated: isAnimatedOutput() })
      : undefined,
    onDebug: logger.debug,
    knipSession: options.knipSession,
  });
  await renderOutcome(outcome, options);
  return outcome;
};

/** Upper bound for concurrent project scans: ESLint runs in this process, so more only adds memory. */
const MAX_CONCURRENT_PROJECT_SCANS = 4;

/**
 * How many projects to scan at once: half the available CPUs, because every scan already runs its
 * analyzers concurrently (oxlint and knip in child processes, ESLint here), so one scan keeps about
 * two cores busy and more concurrent scans only oversubscribe the machine. At least 1, at most 4
 * (see MAX_CONCURRENT_PROJECT_SCANS) and never more than there are projects.
 */
export const resolveScanConcurrency = (
  projectCount: number,
  cpuCount: number = availableParallelism(),
): number =>
  Math.max(1, Math.min(projectCount, MAX_CONCURRENT_PROJECT_SCANS, Math.floor(cpuCount / 2)));

export interface ProjectScan {
  directory: string;
  options: ScanOptions;
}

/**
 * Scans several projects and prints their results in the order given, whatever the order they
 * finish in. A single project is a plain `scan`. With several, knip runs once for the whole
 * monorepo (a shared `KnipSession`), the projects are analysed concurrently (`concurrency`,
 * default `resolveScanConcurrency`), and output is deferred so nothing interleaves: one spinner
 * while they run, then per project its banner, check outcomes and report, in order.
 * If any project fails (e.g. no Vue dependency), the error is thrown and nothing is printed for the batch.
 */
export const scanProjects = async (
  projects: ProjectScan[],
  concurrency: number = resolveScanConcurrency(projects.length),
): Promise<ScanOutcome[]> => {
  if (projects.length <= 1) {
    return Promise.all(projects.map((project) => scan(project.directory, project.options)));
  }

  const knipSession = createKnipSession();
  const isInteractiveOutput = projects.some((project) => isInteractive(project.options));
  const progress = await createBatchProgressReporter({
    labels: ANALYZER_LABELS,
    total: projects.length,
    animated: isAnimatedOutput() && isInteractiveOutput,
  });
  // Without a project prefix, concurrent --debug lines could not be told apart.
  const debugFor = (directory: string) => (namespace: string, message: string) =>
    logger.debug(namespace, `[${path.basename(directory)}] ${message}`);

  let outcomes: ScanOutcome[];
  try {
    outcomes = await mapWithConcurrency(projects, concurrency, async (project, index) => {
      const outcome = await analyzeProject(project.directory, project.options, {
        onProgress: isInteractive(project.options) ? progress.forProject(index) : undefined,
        onDebug: debugFor(project.directory),
        knipSession,
      });
      progress.projectDone();
      return outcome;
    });
  } finally {
    progress.finish();
  }

  for (const [index, outcome] of outcomes.entries()) {
    const { options } = projects[index];
    if (isInteractiveOutput && isInteractive(options)) {
      printProjectDetection(outcome.project, outcome.isDiffMode, outcome.includePaths);
      progress.flush(index);
    }
    await renderOutcome(outcome, options);
  }
  return outcomes;
};
