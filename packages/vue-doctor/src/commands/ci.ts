import fs from "node:fs";
import path from "node:path";
import { Command, Option } from "commander";
import { VERSION } from "../constants.js";
import { buildReport, type ProjectResult } from "../report/build-report.js";
import { formatReport } from "../report/format-report.js";
import { formatHtml } from "../report/format-html.js";
import { renderMarkdown } from "../report/format-markdown.js";
import { evaluateGate, EXIT_CODES, FAIL_ON_VALUES, GATE_SCOPE_VALUES, type FailOn, type GateScope } from "../core/gate.js";
import { scanProjects } from "../scan.js";
import type { ScanOptions } from "../types.js";
import { getDiffInfo, filterSourceFiles } from "../utils/get-diff-files.js";
import { logger } from "../utils/logger.js";
import { handleError } from "../utils/handle-error.js";
import { GitHubClient } from "../ci/github-client.js";
import {
  postStickySummary,
  postReviewComments,
  postCommitStatus,
  emitAnnotations,
  type FeedbackMode,
  type GroupingMode,
} from "../ci/feedback.js";
import {
  calculateScoreDelta,
  loadCachedBaseReport,
  scanBaseBranchWithWorktree,
} from "../ci/score-cache.js";
import {
  renderMainWorkflow,
  renderForkCommentWorkflow,
} from "../ci/workflow-generator.js";

const writeGitHubOutput = (key: string, value: string | number): void => {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  try {
    fs.appendFileSync(outputPath, `${key}=${value}\n`);
  } catch {
    // Ignore error if output file is not writable
  }
};

export const registerCiCommand = (program: Command): void => {
  const ci = program
    .command("ci")
    .description("CI automation, GitHub Actions integration and PR feedback");

  // vue-doctor ci run
  ci.command("run")
    .description("Execute CI scan with gate evaluation, reports and optional PR feedback")
    .argument("[directory]", "Directory to scan", ".")
    .option("--scope <scope>", "Scope: changed, lines, or full")
    .addOption(new Option("--fail-on <severity>", "Gate severity").choices(FAIL_ON_VALUES).default("error"))
    .addOption(new Option("--gate <scope>", "Gate scope").choices(GATE_SCOPE_VALUES).default("new"))
    .option("--min-score <score>", "Fail if score is below this threshold", Number)
    .option("--strict", "Strict gate: analyzer failures fail the gate", false)
    .option("--feedback <modes>", "Feedback modes comma-separated: summary,findings,annotations,none", "summary,findings")
    .addOption(new Option("--grouping <grouping>", "PR comments grouping").choices(["finding", "rule-per-file", "rule"]).default("rule-per-file"))
    .option("--max-comments <n>", "Maximum number of PR review comments", Number, 30)
    .option("--no-agent-prompt", "Omit AI fix prompt block in comments")
    .option("--sarif", "Generate SARIF output", false)
    .option("--audit", "Enable OSV dependency audit", false)
    .option("--report", "Generate interactive HTML report file", false)
    .option("--baseline <path>", "Path to baseline file")
    .option("--allow-pull-request-target", "Allow running under pull_request_target (unsafe)", false)
    .option("--github-token <token>", "GitHub API token (defaults to GITHUB_TOKEN)")
    .action(async (directoryArg: string, options: any) => {
      try {
        // Guard against pull_request_target without override
        if (process.env.GITHUB_EVENT_NAME === "pull_request_target" && !options.allowPullRequestTarget) {
          logger.error(
            "Security Guard: vue-doctor refuses to run under `pull_request_target` because scanning executes untrusted repository config. " +
              "Use `pull_request` instead, or pass `--allow-pull-request-target` if you understand the risks.",
          );
          process.exitCode = EXIT_CODES.usageError;
          return;
        }

        const projectDir = path.resolve(directoryArg);
        const isPr = Boolean(process.env.GITHUB_BASE_REF || process.env.GITHUB_HEAD_REF);
        const scope = options.scope ?? (isPr ? "changed" : "full");

        let changedFiles: string[] | undefined;
        if (scope === "changed" || scope === "lines") {
          const baseRef = process.env.GITHUB_BASE_REF?.trim() || undefined;
          const diffInfo = getDiffInfo(projectDir, baseRef);
          if (diffInfo.status === "ok") {
            changedFiles = filterSourceFiles(diffInfo.changedFiles);
            logger.log(`Scanning ${changedFiles.length} changed files...`);
          }
        }

        const scanOptions: ScanOptions = {
          includePaths: changedFiles ?? [],
          baseline: options.baseline ? path.resolve(options.baseline) : undefined,
          audit: options.audit,
        };

        const scanResults = await scanProjects([
          { directory: projectDir, options: scanOptions },
        ]);

        const projectResults: ProjectResult[] = scanResults.map((outcome) => ({
          directory: outcome.directory,
          result: outcome,
        }));

        const report = buildReport(projectResults, {
          version: VERSION,
          generatedAt: new Date(),
          scanDirectory: projectDir,
        });

        // Score Delta against base branch if in PR
        let deltaInfo = { baseScore: null as number | null, scoreDelta: null as number | null, newIssuesCount: 0, fixedIssuesCount: 0 };
        const baseRef = process.env.GITHUB_BASE_REF;
        if (baseRef) {
          const cachePath = path.resolve(projectDir, "node_modules/.cache/vue-doctor/vue-doctor-base.json");
          let baseReport = loadCachedBaseReport(cachePath);
          if (!baseReport) {
            baseReport = await scanBaseBranchWithWorktree(projectDir, baseRef);
          }
          if (baseReport) {
            deltaInfo = calculateScoreDelta(report, baseReport);
          }
        }

        // Gate evaluation
        const gateOutcome = evaluateGate(scanResults, {
          failOn: options.failOn as FailOn,
          gate: options.gate as GateScope,
          minScore: options.minScore,
          strict: options.strict,
        });

        // Write artifact files
        const jsonPath = path.resolve(projectDir, "vue-doctor.json");
        fs.writeFileSync(jsonPath, formatReport(report, "json"));
        logger.log(`Wrote JSON report to ${jsonPath}`);

        let sarifPath = "";
        if (options.sarif) {
          sarifPath = path.resolve(projectDir, "vue-doctor.sarif");
          fs.writeFileSync(sarifPath, formatReport(report, "sarif"));
          logger.log(`Wrote SARIF report to ${sarifPath}`);
        }

        const mdPath = path.resolve(projectDir, "vue-doctor.md");
        const markdownReport = renderMarkdown(report, { stickyMarker: true });
        fs.writeFileSync(mdPath, markdownReport);

        let reportPath = "";
        if (options.report) {
          reportPath = path.resolve(projectDir, "vue-doctor-report.html");
          fs.writeFileSync(reportPath, formatHtml(report));
          logger.log(`Wrote HTML report to ${reportPath}`);
        }

        // GITHUB_STEP_SUMMARY
        if (process.env.GITHUB_STEP_SUMMARY) {
          try {
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownReport + "\n");
          } catch {
            // Ignore error
          }
        }

        // GITHUB_OUTPUT
        writeGitHubOutput("score", report.projects[0]?.score.value ?? 100);
        if (deltaInfo.baseScore !== null) writeGitHubOutput("base-score", deltaInfo.baseScore);
        if (deltaInfo.scoreDelta !== null) writeGitHubOutput("score-delta", deltaInfo.scoreDelta);
        writeGitHubOutput("errors", report.summary.errors);
        writeGitHubOutput("warnings", report.summary.warnings);
        writeGitHubOutput("new-issues", deltaInfo.newIssuesCount);
        writeGitHubOutput("fixed-issues", deltaInfo.fixedIssuesCount);
        writeGitHubOutput("json-path", jsonPath);
        if (sarifPath) writeGitHubOutput("sarif-path", sarifPath);
        if (reportPath) writeGitHubOutput("report-path", reportPath);

        // Feedback modes
        const feedbackModes: FeedbackMode[] = (options.feedback ?? "summary,findings")
          .split(",")
          .map((m: string) => m.trim().toLowerCase());

        if (feedbackModes.includes("annotations")) {
          emitAnnotations(report);
        }

        const token = options.githubToken ?? process.env.GITHUB_TOKEN;
        const repoFullName = process.env.GITHUB_REPOSITORY; // "owner/repo"
        const prNumberStr = process.env.GITHUB_REF_NAME?.split("/")[0] || process.env.PR_NUMBER;
        const prNumber = prNumberStr ? parseInt(prNumberStr, 10) : undefined;
        const commitSha = process.env.GITHUB_SHA || "HEAD";

        if (token && repoFullName && !feedbackModes.includes("none")) {
          const [owner, repoName] = repoFullName.split("/");
          const client = new GitHubClient({ token });

          const feedbackOpts = {
            feedback: feedbackModes,
            grouping: (options.grouping ?? "rule-per-file") as GroupingMode,
            maxComments: options.maxComments ?? 30,
            agentPrompt: options.agentPrompt !== false,
            owner,
            repo: repoName,
            pullNumber: prNumber && !Number.isNaN(prNumber) ? prNumber : undefined,
            commitSha,
            scoreDelta: deltaInfo.scoreDelta ?? undefined,
            baseScore: deltaInfo.baseScore ?? undefined,
          };

          if (feedbackModes.includes("summary") && feedbackOpts.pullNumber) {
            await postStickySummary(client, feedbackOpts, report);
          }
          if (feedbackModes.includes("findings") && feedbackOpts.pullNumber) {
            await postReviewComments(client, feedbackOpts, report);
          }
          await postCommitStatus(client, feedbackOpts, report, gateOutcome.exitCode === EXIT_CODES.ok);
        }

        process.exitCode = gateOutcome.exitCode;
      } catch (error) {
        handleError(error);
      }
    });

  // vue-doctor ci report
  ci.command("report")
    .description("Post PR feedback from an existing scan report JSON document")
    .option("--report-json <path>", "Path to vue-doctor.json report", "vue-doctor.json")
    .option("--feedback <modes>", "Feedback modes: summary,findings,annotations,none", "summary,findings")
    .addOption(new Option("--grouping <grouping>", "PR comments grouping").choices(["finding", "rule-per-file", "rule"]).default("rule-per-file"))
    .option("--max-comments <n>", "Maximum number of PR review comments", Number, 30)
    .option("--no-agent-prompt", "Omit AI fix prompt block in comments")
    .option("--github-token <token>", "GitHub API token")
    .action(async (options: any) => {
      try {
        const reportPath = path.resolve(options.reportJson ?? "vue-doctor.json");
        if (!fs.existsSync(reportPath)) {
          throw new Error(`Report file not found: ${reportPath}`);
        }
        const raw = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        const { reportSchema } = await import("../report/model.js");
        const report = reportSchema.parse(raw);

        const token = options.githubToken ?? process.env.GITHUB_TOKEN;
        const repoFullName = process.env.GITHUB_REPOSITORY;
        if (!token || !repoFullName) {
          throw new Error("GitHub token and GITHUB_REPOSITORY must be provided to post CI report.");
        }

        const [owner, repoName] = repoFullName.split("/");
        const prNumberStr = process.env.PR_NUMBER || process.env.GITHUB_REF_NAME?.split("/")[0];
        const prNumber = prNumberStr ? parseInt(prNumberStr, 10) : undefined;
        const commitSha = process.env.GITHUB_SHA || "HEAD";

        const feedbackModes: FeedbackMode[] = (options.feedback ?? "summary,findings")
          .split(",")
          .map((m: string) => m.trim().toLowerCase());

        const client = new GitHubClient({ token });
        const feedbackOpts = {
          feedback: feedbackModes,
          grouping: (options.grouping ?? "rule-per-file") as GroupingMode,
          maxComments: options.maxComments ?? 30,
          agentPrompt: options.agentPrompt !== false,
          owner,
          repo: repoName,
          pullNumber: prNumber && !Number.isNaN(prNumber) ? prNumber : undefined,
          commitSha,
        };

        if (feedbackModes.includes("summary") && feedbackOpts.pullNumber) {
          await postStickySummary(client, feedbackOpts, report);
        }
        if (feedbackModes.includes("findings") && feedbackOpts.pullNumber) {
          await postReviewComments(client, feedbackOpts, report);
        }
        await postCommitStatus(client, feedbackOpts, report, report.summary.errors === 0);
      } catch (error) {
        handleError(error);
      }
    });

  // vue-doctor ci install
  ci.command("install")
    .description("Install Vue Doctor GitHub Actions workflow into .github/workflows/")
    .argument("[directory]", "Project directory", ".")
    .option("-y, --yes", "Skip prompts")
    .option("-f, --force", "Overwrite existing workflow files", false)
    .option("--fail-on <severity>", "Gate fail-on severity", "error")
    .option("--feedback <modes>", "PR feedback modes", "summary,findings")
    .option("--grouping <mode>", "PR review comment grouping", "rule-per-file")
    .option("--sarif", "Enable SARIF generation and upload", false)
    .option("--audit", "Enable OSV audit", false)
    .option("--fork-comments", "Add comment workflow for fork PRs", false)
    .action(async (directoryArg: string, options: any) => {
      try {
        const projectDir = path.resolve(directoryArg);
        const workflowsDir = path.join(projectDir, ".github", "workflows");
        fs.mkdirSync(workflowsDir, { recursive: true });

        const mainWfPath = path.join(workflowsDir, "vue-doctor.yml");
        const mainWfContent = renderMainWorkflow(options);

        if (fs.existsSync(mainWfPath) && !options.force) {
          const current = fs.readFileSync(mainWfPath, "utf8");
          if (current === mainWfContent) {
            logger.log("Workflow is already up to date.");
          } else {
            logger.warn(`Workflow exists at ${mainWfPath}. Use --force to overwrite.`);
          }
        } else {
          fs.writeFileSync(mainWfPath, mainWfContent);
          logger.success(`Wrote workflow to ${mainWfPath}`);
        }

        if (options.forkComments) {
          const forkWfPath = path.join(workflowsDir, "vue-doctor-comment.yml");
          const forkWfContent = renderForkCommentWorkflow();
          if (fs.existsSync(forkWfPath) && !options.force) {
            logger.warn(`Fork comment workflow exists at ${forkWfPath}. Use --force to overwrite.`);
          } else {
            fs.writeFileSync(forkWfPath, forkWfContent);
            logger.success(`Wrote fork comment workflow to ${forkWfPath}`);
          }
        }
      } catch (error) {
        handleError(error);
      }
    });

  // vue-doctor ci config
  ci.command("config")
    .description("Print the generated GitHub Actions workflow YAML to stdout")
    .option("--fail-on <severity>", "Gate fail-on severity", "error")
    .option("--feedback <modes>", "PR feedback modes", "summary,findings")
    .option("--grouping <mode>", "PR review comment grouping", "rule-per-file")
    .option("--sarif", "Enable SARIF", false)
    .option("--audit", "Enable audit", false)
    .action((options: any) => {
      console.log(renderMainWorkflow(options));
    });

  // vue-doctor ci upgrade
  ci.command("upgrade")
    .description("Re-generate existing Vue Doctor workflow preserving settings")
    .argument("[directory]", "Project directory", ".")
    .action((directoryArg: string) => {
      const projectDir = path.resolve(directoryArg);
      const mainWfPath = path.join(projectDir, ".github", "workflows", "vue-doctor.yml");
      if (!fs.existsSync(mainWfPath)) {
        logger.error(`No existing workflow found at ${mainWfPath}. Run \`vue-doctor ci install\` instead.`);
        process.exitCode = EXIT_CODES.usageError;
        return;
      }
      const updated = renderMainWorkflow();
      fs.writeFileSync(mainWfPath, updated);
      logger.success(`Upgraded workflow at ${mainWfPath}`);
    });
};
