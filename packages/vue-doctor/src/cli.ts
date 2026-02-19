import path from "node:path";
import { Command } from "commander";
import { scan } from "./scan.js";
import type { ScanOptions } from "./types.js";
import { getDiffInfo, filterSourceFiles } from "./utils/get-diff-files.js";
import { handleError } from "./utils/handle-error.js";
import { selectProjects } from "./utils/select-projects.js";

const VERSION = process.env.VERSION ?? "1.0.0";

const program = new Command();

program
  .name("vue-doctor")
  .description("Diagnose and fix performance issues in your Vue.js app")
  .version(VERSION)
  .argument("[directory]", "Project directory to scan", ".")
  .option("--no-lint", "Skip lint checks")
  .option("--no-dead-code", "Skip dead code checks")
  .option("-v, --verbose", "Show file details per rule")
  .option("--score", "Output just the score number")
  .option("--json", "Output results as JSON")
  .option("--report", "Generate an HTML report")
  .option("--github-summary", "Write results to GitHub Actions step summary")
  .option("--diff [branch]", "Only scan files changed vs. a branch or current changes")
  .option("-y, --yes", "Skip interactive prompts")
  .option("--project <names>", "Workspace project(s) to scan (comma-separated)")
  .option("--offline", "Disable network requests")
  .option("-f, --force", "Bypass Vue dependency check")
  .action(async (directoryArg: string, options: Record<string, any>) => {
    try {
      const resolvedDirectory = path.resolve(directoryArg);
      const isCI = Boolean(process.env.CI);
      const shouldSkipPrompts = options.yes ?? isCI;

      const projectDirectories = await selectProjects(
        resolvedDirectory,
        options.project,
        shouldSkipPrompts,
      );

      for (const projectDirectory of projectDirectories) {
        const scanOptions: ScanOptions = {
          lint: options.lint,
          deadCode: options.deadCode,
          verbose: options.verbose ?? false,
          scoreOnly: options.score ?? false,
          offline: options.offline ?? false,
          json: options.json ?? false,
          report: options.report ?? false,
          githubSummary: options.githubSummary ?? false,
          force: options.force ?? false,
          includePaths: [],
        };

        // Handle diff mode
        if (options.diff !== undefined) {
          const explicitBranch =
            typeof options.diff === "string" ? options.diff : undefined;
          const diffInfo = getDiffInfo(projectDirectory, explicitBranch);

          if (diffInfo) {
            scanOptions.includePaths = filterSourceFiles(diffInfo.changedFiles);
          }
        }

        await scan(projectDirectory, scanOptions);
      }
    } catch (error) {
      handleError(error);
    }
  });

program.parse(process.argv);
