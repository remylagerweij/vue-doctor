import path from "node:path";
import pc from "picocolors";
import { MILLISECONDS_PER_SECOND, PERFECT_SCORE, SCORE_BAR_WIDTH_CHARS } from "./constants.js";
import type { Diagnostic, ScanOptions, ScanResult, VueDoctorConfig } from "./types.js";
import { calculateScore } from "./utils/calculate-score.js";
import { colorizeByScore } from "./utils/colorize-by-score.js";
import { combineDiagnostics, computeVueIncludePaths } from "./utils/combine-diagnostics.js";
import { discoverProject, formatFrameworkName } from "./utils/discover-project.js";
import { createFramedLine, printFramedBox, type FramedLine } from "./utils/framed-box.js";
import { groupBy } from "./utils/group-by.js";
import { highlighter } from "./utils/highlighter.js";
import { loadConfig } from "./utils/load-config.js";
import { logger } from "./utils/logger.js";
import { resolveNodeForOxlint } from "./utils/resolve-compatible-node.js";
import { runKnip } from "./utils/run-knip.js";
import { runEslintVue } from "./utils/run-eslint-vue.js";
import { runOxlint } from "./utils/run-oxlint.js";
import { spinner } from "./utils/spinner.js";

const printProjectDetection = (
  projectInfo: ReturnType<typeof discoverProject>,
  _userConfig: VueDoctorConfig | null,
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

  logger.log(`  ${filled}${empty} ${scoreLabel}${maxLabel}`);
};

const printDiagnosticsSummary = (
  diagnostics: Diagnostic[],
  verbose: boolean,
): void => {
  if (diagnostics.length === 0) {
    logger.success("  ✓ No issues found!");
    return;
  }

  const byCategory = groupBy(diagnostics, (diagnostic) => diagnostic.category);

  for (const [category, categoryDiagnostics] of byCategory) {
    const errorCount = categoryDiagnostics.filter((d) => d.severity === "error").length;
    const warningCount = categoryDiagnostics.filter((d) => d.severity === "warning").length;

    const parts: string[] = [];
    if (errorCount > 0) parts.push(highlighter.error(`${errorCount} error${errorCount > 1 ? "s" : ""}`));
    if (warningCount > 0) parts.push(highlighter.warn(`${warningCount} warning${warningCount > 1 ? "s" : ""}`));

    logger.log(`  ${pc.bold(category)}: ${parts.join(", ")}`);

    if (verbose) {
      const byRule = groupBy(categoryDiagnostics, (d) => `${d.plugin}/${d.rule}`);
      for (const [_ruleKey, ruleDiagnostics] of byRule) {
        const firstDiag = ruleDiagnostics[0];
        const icon = firstDiag.severity === "error" ? highlighter.error("✕") : highlighter.warn("△");
        logger.log(`    ${icon} ${firstDiag.message} ${pc.dim(`(×${ruleDiagnostics.length})`)}`);

        if (firstDiag.help) {
          logger.log(`      ${pc.dim("→ " + firstDiag.help)}`);
        }

        // Show up to 3 affected files
        const filesByCount = groupBy(ruleDiagnostics, (d) => d.filePath);
        let shown = 0;
        for (const [filePath, _fileDiags] of filesByCount) {
          if (shown >= 3) {
            const remaining = filesByCount.size - 3;
            if (remaining > 0) {
              logger.log(`      ${pc.dim(`... and ${remaining} more file${remaining > 1 ? "s" : ""}`)}`);
            }
            break;
          }
          logger.log(`      ${pc.dim(filePath)}`);
          shown++;
        }
      }
    }
  }

  if (!verbose && diagnostics.length > 0) {
    logger.log("");
    logger.log(`  ${pc.dim("💡 Tip: Run with ")}${pc.bold("--verbose")}${pc.dim(" to see detailed file paths, or ")}${pc.bold("--json")}${pc.dim(" for machine-readable output.")}`);
  }
};

export const scan = async (
  directory: string,
  inputOptions: ScanOptions = {},
): Promise<ScanResult> => {
  const startTime = performance.now();
  const projectInfo = discoverProject(directory);
  const userConfig = loadConfig(directory);
  const options = { ...inputOptions };
  const includePaths = options.includePaths ?? [];
  const isDiffMode = includePaths.length > 0;

  if (!projectInfo.vueVersion && !options.force) {
    throw new Error("No Vue dependency found in package.json. Use --force to bypass this check.");
  }

  if (!options.scoreOnly) {
    printProjectDetection(projectInfo, userConfig, isDiffMode, includePaths);
  }

  const vueIncludePaths = computeVueIncludePaths(includePaths);

  let didLintFail = false;
  let didDeadCodeFail = false;
  let didTemplateLintFail = false;

  const resolvedNode = await (async () => {
    if (options.lint === false) return null;
    const resolution = resolveNodeForOxlint();
    if (!resolution) {
      didLintFail = true;
      if (!options.scoreOnly) {
        logger.warn("  ⚠ Lint checks require Node.js ≥20.19 or ≥22.12. Skipping lint pass.");
      }
    }
    return resolution;
  })();

  const lintPromise = resolvedNode
    ? (async () => {
        const lintSpinner = options.scoreOnly ? null : spinner("Running lint checks...").start();
        try {
          const lintDiagnostics = await runOxlint(
            directory,
            projectInfo.hasTypeScript,
            projectInfo.framework,
            isDiffMode ? vueIncludePaths : undefined,
            resolvedNode.binaryPath,
          );
          lintSpinner?.succeed("Running lint checks.");
          return lintDiagnostics;
        } catch (error) {
          didLintFail = true;
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isNativeBindingError = errorMessage.includes("native binding");
          lintSpinner?.fail(
            isNativeBindingError
              ? `Lint checks failed — oxlint's native binding requires a compatible Node.js version.`
              : `Lint checks failed: ${errorMessage}`,
          );
          return [] as Diagnostic[];
        }
      })()
    : Promise.resolve([] as Diagnostic[]);

  const templateLintPromise = options.lint !== false
    ? (async () => {
        const templateSpinner = options.scoreOnly ? null : spinner("Running template checks...").start();
        try {
          const templateDiagnostics = await runEslintVue(
            directory,
            isDiffMode ? vueIncludePaths : undefined,
          );
          templateSpinner?.succeed("Running template checks.");
          return templateDiagnostics;
        } catch (error) {
          didTemplateLintFail = true;
          const errorMessage = error instanceof Error ? error.message : String(error);
          templateSpinner?.fail(`Template checks failed: ${errorMessage}`);
          return [] as Diagnostic[];
        }
      })()
    : Promise.resolve([] as Diagnostic[]);

  const deadCodePromise = options.deadCode !== false && !isDiffMode
    ? (async () => {
        const deadCodeSpinner = options.scoreOnly
          ? null
          : spinner("Running dead code checks...").start();
        try {
          const deadCodeDiagnostics = await runKnip(directory);
          deadCodeSpinner?.succeed("Running dead code checks.");
          return deadCodeDiagnostics;
        } catch (error) {
          didDeadCodeFail = true;
          const errorMessage = error instanceof Error ? error.message : String(error);
          deadCodeSpinner?.fail(`Dead code checks failed: ${errorMessage}`);
          return [] as Diagnostic[];
        }
      })()
    : Promise.resolve([] as Diagnostic[]);

  const [lintDiagnostics, templateLintDiagnostics, deadCodeDiagnostics] = await Promise.all([
    lintPromise,
    templateLintPromise,
    deadCodePromise,
  ]);

  const diagnostics = combineDiagnostics(
    [...lintDiagnostics, ...templateLintDiagnostics],
    deadCodeDiagnostics,
    directory,
    isDiffMode,
    userConfig,
  );

  const scoreResult = await calculateScore(diagnostics);
  const skippedChecks: string[] = [];
  if (didLintFail) skippedChecks.push("lint");
  if (didTemplateLintFail) skippedChecks.push("template lint");
  if (didDeadCodeFail) skippedChecks.push("dead code");

  const elapsedMs = performance.now() - startTime;
  const elapsed = (elapsedMs / MILLISECONDS_PER_SECOND).toFixed(1);

  const reportData = {
    score: scoreResult?.score ?? 0,
    label: scoreResult?.label ?? "Unknown",
    diagnostics,
    project: projectInfo,
    elapsed,
    skippedChecks,
    timestamp: new Date().toISOString(),
  };

  // JSON output mode
  if (options.json) {
    const { generateJsonReport } = await import("./utils/report.js");
    console.log(JSON.stringify(generateJsonReport(reportData), null, 2));
    return { diagnostics, scoreResult, skippedChecks };
  }

  // Score-only mode
  if (options.scoreOnly) {
    if (scoreResult) {
      console.log(scoreResult.score);
    }
    return { diagnostics, scoreResult, skippedChecks };
  }

  // HTML report mode
  if (options.report) {
    const { writeHtmlReport } = await import("./utils/report.js");
    const reportPath = writeHtmlReport(reportData, directory);
    logger.success(`\n  📊 Report saved to ${reportPath}\n`);
  }

  // GitHub Actions step summary
  if (options.githubSummary && process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import("node:fs");
    const { generateGithubSummary } = await import("./utils/report.js");
    const summary = generateGithubSummary(reportData);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    logger.success("  📝 Written to GitHub Step Summary");
  }

  // Print results
  logger.break();

  if (scoreResult) {
    printScoreGauge(scoreResult.score);
    logger.break();

    const scoreLabel = colorizeByScore(scoreResult.label, scoreResult.score);
    logger.log(`  ${pc.bold("Score:")} ${colorizeByScore(String(scoreResult.score), scoreResult.score)} — ${scoreLabel}`);
  }

  logger.log(`  ${pc.dim(`Completed in ${elapsed}s`)}`);

  logger.break();
  printDiagnosticsSummary(diagnostics, options.verbose ?? false);
  logger.break();

  if (skippedChecks.length > 0) {
    logger.warn(`  ⚠ Skipped: ${skippedChecks.join(", ")}`);
  }

  return { diagnostics, scoreResult, skippedChecks };
};
