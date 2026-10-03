import fs from "node:fs";
import path from "node:path";
import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { registerBaselineCommand } from "./commands/baseline.js";
import { registerCiCommand } from "./commands/ci.js";
import { registerInitCommand } from "./commands/init.js";
import { registerRulesCommand, registerExplainCommand } from "./commands/rules.js";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { loadConfig } from "./config/load-config.js";
import type { VueDoctorConfig } from "./config/schema.js";
import {
  EXIT_CODES,
  evaluateGate,
  FAIL_ON_VALUES,
  GATE_SCOPE_VALUES,
  type FailOn,
  type GateOptions,
  type GateOutcome,
  type GateScope,
} from "./core/gate.js";
import { buildReport, type ProjectResult } from "./report/build-report.js";
import { formatHtml } from "./report/format-html.js";
import { renderMarkdown } from "./report/format-markdown.js";
import { formatReport, REPORT_FORMATS, type ReportFormat } from "./report/format-report.js";
import { scanProjects, type ProjectScan } from "./scan.js";
import type { ScanOptions } from "./types.js";
import { relativeToSourceRoot } from "./utils/find-source-root.js";
import { getDiffInfo, filterSourceFiles } from "./utils/get-diff-files.js";
import { handleError } from "./utils/handle-error.js";
import { configureLogger, logger, output } from "./utils/logger.js";
import { createPrivateTempDirectory } from "./utils/private-temp.js";
import { getToolVersions } from "./utils/tool-versions.js";
import { selectProjects } from "./utils/select-projects.js";

const VERSION = process.env.VERSION ?? "1.0.0";

const parseScore = (value: string): number => {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new InvalidArgumentError("Expected an integer between 0 and 100.");
  }
  return score;
};

/** `--json` is an alias of `--format json`; combining it with another format is a usage error. */
const resolveFormat = (options: Record<string, any>): ReportFormat => {
  const format = options.format as ReportFormat | undefined;
  if (options.json && format !== undefined && format !== "json") {
    throw new InvalidArgumentError(`--json cannot be combined with --format ${format}.`);
  }
  return format ?? (options.json ? "json" : "text");
};

const resolveGateOptions = (
  options: Record<string, any>,
  config: VueDoctorConfig | null,
  isFromCli: (optionName: string) => boolean,
): GateOptions => ({
  failOn: isFromCli("failOn") ? (options.failOn as FailOn) : (config?.gate?.failOn ?? "none"),
  gate: isFromCli("gate") ? (options.gate as GateScope) : (config?.gate?.scope ?? "all"),
  minScore: options.minScore ?? config?.gate?.minScore ?? undefined,
  strict: options.strict ?? config?.gate?.strict ?? false,
});

/** The most severe outcome wins: analyzer failure (3) over gate breach (1) over ok (0). */
const EXIT_CODE_PRECEDENCE: number[] = [EXIT_CODES.analyzerFailure, EXIT_CODES.gateBreached, EXIT_CODES.ok];
const mergeGateOutcomes = (outcomes: GateOutcome[]): GateOutcome => ({
  exitCode:
    (EXIT_CODE_PRECEDENCE.find((code) => outcomes.some((outcome) => outcome.exitCode === code)) as
      | GateOutcome["exitCode"]
      | undefined) ?? EXIT_CODES.ok,
  reasons: outcomes.flatMap((outcome) => outcome.reasons),
});

/** Builds the `vue-doctor` command tree. A fresh program per call keeps runs (and tests) isolated. */
export const createProgram = (): Command => {
  const program = new Command();
  // Before any .command(): subcommands copy this setting when they are created.
  program.exitOverride();
  // So that `vue-doctor baseline --output <file>` is not taken by the root `--output` option.
  program.enablePositionalOptions();

  /** True when the user passed the flag; defaults and absent flags fall back to the project config. */
  const isFromCli = (optionName: string): boolean => program.getOptionValueSource(optionName) === "cli";

  program
    .name("vue-doctor")
    .description("Diagnose and fix performance issues in your Vue.js app")
    .version(VERSION)
    .argument("[directory]", "Project directory to scan", ".")
    .option("--no-lint", "Skip lint checks")
    .option("--no-dead-code", "Skip dead code checks")
    .option("--no-cache", "Re-analyze every file instead of reusing results for unchanged files")
    .option("-v, --verbose", "Show file details per rule")
    .option("-q, --quiet", "Only print the report, warnings and errors (no banner or progress)")
    .option("--debug", "Print debug details: resolved config, tool versions, per-analyzer counts (also: DEBUG=vue-doctor:*)")
    .option("--timings", "Print per-analyzer timings")
    .option("--no-color", "Disable colours (also: NO_COLOR=1; FORCE_COLOR=1 forces them)")
    .option("--score", "Output just the score number")
    .addOption(
      new Option("--format <format>", "Report format: text, json (one report@2 document), jsonl (one finding per line), sarif (SARIF 2.1.0 for GitHub code scanning), github (GitHub Actions annotations), markdown (PR comment / step summary) or html (self-contained interactive report file)").choices(
        REPORT_FORMATS,
      ),
    )
    .option("--json", "Alias for --format json")
    .option("--output <file>", "Write the json/jsonl/sarif/github/markdown/html report to this file instead of stdout")
    .option("--no-timestamp", "Omit the generation time and timings from json/jsonl output, for reproducible reports")
    .option("--report", "Deprecated: use --format html --output <file>. Writes the HTML report to a private temporary directory (never the project) and prints its path")
    .option("--github-summary", "Write results to GitHub Actions step summary")
    .option("--diff [branch]", "Only scan files changed vs. a branch or current changes")
    .option("-y, --yes", "Skip interactive prompts")
    .option("--project <names>", "Workspace project(s) to scan (comma-separated)")
    .option("--audit", "Check installed dependency versions for known vulnerabilities via OSV.dev (sends package names and versions; needs the network, skipped with --offline)")
    .option("--offline", "Guarantee zero network access (also: VUE_DOCTOR_OFFLINE=1)")
    .option("-f, --force", "Bypass Vue dependency check")
    .addOption(
      new Option("--fail-on <severity>", "Exit with code 1 when findings of this severity (or worse) exist")
        .choices(FAIL_ON_VALUES)
        .default("none"),
    )
    .addOption(
      new Option("--gate <scope>", "Which findings count for --fail-on: all, or only new ones (vs. baseline/base branch)")
        .choices(GATE_SCOPE_VALUES)
        .default("all"),
    )
    .option("--min-score <score>", "Exit with code 1 when the score is below this value (0-100)", parseScore)
    .option("--strict", "Exit with code 3 when an analyzer could not run")
    .option("--baseline <file>", "Treat findings in this baseline file as known (status: baseline); see `vue-doctor baseline`")
    .option("--fix", "Automatically apply deterministic codemods to source files", false)
    .option("--dry-run", "Show diff of fixes without writing changes to disk", false)
    .action(async (directoryArg: string, options: Record<string, any>) => {
      try {
        if (options.quiet && options.debug) {
          throw new InvalidArgumentError("--quiet and --debug cannot be combined.");
        }
        configureLogger({
          level: options.debug ? "debug" : options.quiet ? "quiet" : "normal",
          debugEnv: process.env.DEBUG,
        });
        logger.debug("env", `vue-doctor ${VERSION}, node ${process.version}, ${process.platform}-${process.arch}`);
        logger.debug("env", `argv ${JSON.stringify(process.argv.slice(2))}`);
        logger.debug("env", `tools ${JSON.stringify(getToolVersions())}`);
        const resolvedDirectory = path.resolve(directoryArg);
        const isCI = Boolean(process.env.CI);
        const shouldSkipPrompts = options.yes ?? isCI;

        const projectDirectories = await selectProjects(
          resolvedDirectory,
          options.project,
          shouldSkipPrompts,
        );

        const format = resolveFormat(options);
        if (options.output && format === "text") {
          throw new InvalidArgumentError("--output requires --format json, jsonl, sarif, github, markdown or html.");
        }
        // 1.x `--report` wrote vue-doctor-report.html into the scanned project; it now goes to a temp directory.
        const legacyHtmlReport = options.report === true;
        if (legacyHtmlReport) {
          logger.warn(
            "--report is deprecated and will be removed in a future release; use --format html --output <file>.",
          );
        }

        if (options.fix) {
          const { runFixes } = await import("./fix/runner.js");
          for (const projectDirectory of projectDirectories) {
            const fixReport = runFixes(projectDirectory, { dryRun: options.dryRun });
            if (options.dryRun) {
              if (fixReport.diffs.length > 0) {
                console.log(fixReport.diffs.join("\n\n"));
              } else {
                logger.log("No fixable issues found.");
              }
            } else if (fixReport.filesFixed > 0) {
              const ruleCount = Object.values(fixReport.rulesFixed).reduce((a, b) => a + b, 0);
              logger.success(
                `Applied fixes to ${fixReport.filesFixed} file${fixReport.filesFixed === 1 ? "" : "s"} (${ruleCount} rules repaired).`,
              );
            }
          }
          if (options.dryRun) {
            process.exitCode = EXIT_CODES.ok;
            return;
          }
        }

        // Prepared one after another (config, diff), then scanned together so knip runs once per monorepo.
        const scans: Array<ProjectScan & { config: VueDoctorConfig | null }> = [];

        for (const projectDirectory of projectDirectories) {
          const loadedConfig = await loadConfig(projectDirectory);
          const config = loadedConfig?.config ?? null;
          logger.debug("config", loadedConfig ? `loaded ${loadedConfig.filePath}` : `no config file in ${projectDirectory}`);
          const scanOptions: ScanOptions = {
            // Unset unless passed on the command line, so the project config applies.
            lint: isFromCli("lint") ? options.lint : undefined,
            deadCode: isFromCli("deadCode") ? options.deadCode : undefined,
            cache: isFromCli("cache") ? options.cache : undefined,
            verbose: options.verbose ?? config?.verbose ?? false,
            timings: options.timings ?? false,
            scoreOnly: options.score ?? false,
            offline: options.offline,
            // Unset unless passed, so the config's audit.enabled applies.
            audit: isFromCli("audit") ? options.audit : undefined,
            json: format !== "text",
            force: options.force ?? false,
            includePaths: [],
            config,
            baseline: options.baseline === undefined ? undefined : path.resolve(options.baseline),
          };

          const diff = options.diff ?? (config?.diff === false ? undefined : config?.diff);

          // Handle diff mode
          if (diff !== undefined) {
            const explicitBranch = typeof diff === "string" ? diff : undefined;
            const diffInfo = getDiffInfo(projectDirectory, explicitBranch);

            if (diffInfo.status === "unavailable") {
              logger.warn(`--diff is unavailable (${diffInfo.reason}); running a FULL scan of ${projectDirectory}.`);
            } else {
              const changedSourceFiles =
                diffInfo.status === "ok" ? filterSourceFiles(diffInfo.changedFiles) : [];

              // An empty includePaths means "scan everything", so with nothing to scan we
              // skip the project (exit 0): a diff run without relevant changes has no findings.
              if (changedSourceFiles.length === 0) {
                const scope = diffInfo.isCurrentChanges
                  ? "uncommitted changes"
                  : `changes vs. ${diffInfo.baseBranch}`;
                logger.dim(`No changed source files in ${scope} for ${projectDirectory}; nothing to scan.`);
                continue;
              }
              scanOptions.includePaths = changedSourceFiles;
            }
          }

          scans.push({ directory: projectDirectory, options: scanOptions, config });
        }

        const outcomes = await scanProjects(scans);
        const gateOutcomes: GateOutcome[] = outcomes.map((outcome, index) =>
          evaluateGate([outcome], resolveGateOptions(options, scans[index].config, isFromCli)),
        );
        const projectResults: ProjectResult[] = outcomes.map((outcome) => ({ directory: outcome.directory, result: outcome }));

        const stepSummaryPath = options.githubSummary ? process.env.GITHUB_STEP_SUMMARY : undefined;
        if (format !== "text" || stepSummaryPath || legacyHtmlReport) {
          const report = buildReport(projectResults, {
            version: VERSION,
            generatedAt: options.timestamp === false ? null : new Date(),
            scanDirectory: resolvedDirectory,
          });
          // The step summary is Markdown whatever the stdout format is; its content is escaped (threat T9).
          if (stepSummaryPath) {
            fs.appendFileSync(stepSummaryPath, `${renderMarkdown(report, { collapseFindings: true })}\n`);
            logger.success("Written to GitHub Step Summary");
          }
          if (legacyHtmlReport && format !== "html") {
            const target = createPrivateTempDirectory("report").writeFile("vue-doctor-report.html", formatHtml(report));
            logger.success(`HTML report written to ${target}`);
          }
          if (format !== "text") {
            const formatted = formatReport(report, format, {
              warn: (message) => logger.warn(message),
              ...(format === "sarif" || format === "github" ? { sourceRootPrefix: relativeToSourceRoot(resolvedDirectory) } : {}),
            });
            if (options.output) {
              const target = path.resolve(options.output);
              fs.mkdirSync(path.dirname(target), { recursive: true });
              fs.writeFileSync(target, formatted, "utf-8");
              logger.success(`Report written to ${target}`);
            } else {
              // Formatters end with a newline and output.line adds one.
              output.line(formatted.replace(/\n$/, ""));
            }
          }
        }

        const gateOutcome = mergeGateOutcomes(gateOutcomes);
        for (const reason of gateOutcome.reasons) {
          logger.error(`  ✕ ${reason}`);
        }
        process.exitCode = gateOutcome.exitCode;
      } catch (error) {
        handleError(error);
      }
    });


  registerBaselineCommand(program);
  registerCiCommand(program);
  registerInitCommand(program);
  registerRulesCommand(program);
  registerExplainCommand(program);
  registerAgentsCommand(program);
  registerMcpCommand(program);

  return program;
};

/** Runs the CLI with `argv` (node, script, ...args); sets `process.exitCode` instead of exiting where it can. */
export const runCli = async (argv: string[] = process.argv): Promise<void> => {
  try {
    await createProgram().parseAsync(argv);
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      // Help and --version are successful exits; every other parse error is a usage error.
      const isInformational =
        error.code === "commander.helpDisplayed" || error.code === "commander.version" || error.code === "commander.help";
      process.exitCode = isInformational ? EXIT_CODES.ok : EXIT_CODES.usageError;
      return;
    }
    handleError(error);
  }
};
