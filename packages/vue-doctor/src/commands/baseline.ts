import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../config/load-config.js";
import { createBaseline, DEFAULT_BASELINE_FILENAME, writeBaseline } from "../core/baseline.js";
import { diagnose } from "../core/diagnose.js";
import { EXIT_CODES } from "../core/gate.js";
import { handleError } from "../utils/handle-error.js";
import { logger } from "../utils/logger.js";
import { createKnipSession } from "../utils/run-knip.js";
import { selectProjects } from "../utils/select-projects.js";

const displayPath = (filePath: string): string => path.relative(process.cwd(), filePath) || filePath;

/**
 * `vue-doctor baseline [directory]`: records the current findings so that `--baseline` (or the
 * config's `baseline`) marks them as known and `--gate new` only fails on findings added later.
 */
export const registerBaselineCommand = (program: Command): void => {
  program
    .command("baseline")
    .description("Write the current findings to a baseline file, so only new findings fail the gate")
    .argument("[directory]", "Project directory to scan", ".")
    .option(
      "-o, --output <file>",
      `Baseline file to write (default: the config's "baseline", else <project>/${DEFAULT_BASELINE_FILENAME})`,
    )
    .option("--project <names>", "Workspace project(s) to scan (comma-separated)")
    .option("-y, --yes", "Skip interactive prompts")
    .action(async (directoryArg: string, options: { output?: string; project?: string; yes?: boolean }) => {
      try {
        const projectDirectories = await selectProjects(
          path.resolve(directoryArg),
          options.project,
          options.yes ?? Boolean(process.env.CI),
        );
        if (options.output && projectDirectories.length > 1) {
          throw new Error("--output can only be used with a single project; use --project to pick one.");
        }

        // One knip run serves every project of the monorepo.
        const knipSession = createKnipSession();
        for (const projectDirectory of projectDirectories) {
          const config = (await loadConfig(projectDirectory))?.config ?? null;
          logger.log(`Scanning ${displayPath(projectDirectory)} ...`);
          // Never apply an existing baseline while recording a new one.
          const result = await diagnose(projectDirectory, { config, baseline: null, knipSession });

          if (result.skipped.length > 0) {
            // An incomplete baseline would later report the missing analyzer's findings as new.
            for (const entry of result.skipped) logger.error(`  ✕ ${entry.analyzer} did not run: ${entry.reason}`);
            logger.error("Baseline not written: every analyzer must run to record a complete baseline.");
            process.exitCode = EXIT_CODES.analyzerFailure;
            return;
          }

          const target = options.output
            ? path.resolve(options.output)
            : path.resolve(projectDirectory, config?.baseline ?? DEFAULT_BASELINE_FILENAME);
          const baseline = createBaseline(result.diagnostics);
          writeBaseline(target, baseline);
          const noun = baseline.findings.length === 1 ? "finding" : "findings";
          logger.success(`Wrote ${baseline.findings.length} ${noun} to ${displayPath(target)}`);
        }
      } catch (error) {
        handleError(error);
      }
    });
};
