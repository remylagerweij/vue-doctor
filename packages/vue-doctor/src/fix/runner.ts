import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { diagnose, type AnalyzerName } from "../core/diagnose.js";
import { ruleIdOf } from "../plugin/rule-ids.js";
import type { Diagnostic, VueDoctorConfig } from "../types.js";
import { logger, output } from "../utils/logger.js";
import { CODEMODS, applyCodemods, createUnifiedDiff, type FixLocation } from "./codemods.js";

/** One file `--fix` would change. */
export interface FixPlanEntry {
  /** Project-relative path, with forward slashes. */
  filePath: string;
  /** Resolved (real) path of the file; always inside the project directory. */
  absolutePath: string;
  original: string;
  fixed: string;
  /** Fixed findings per canonical rule ID. */
  fixedRules: Record<string, number>;
}

export interface FixPlan {
  entries: FixPlanEntry[];
  /** Files with fixable findings that were not touched, and why. */
  skippedFiles: Array<{ filePath: string; reason: string }>;
}

const isInside = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const toPosix = (filePath: string): string => filePath.replace(/\\/g, "/");

/**
 * Works out the fixes for the given findings without writing anything. Only findings of rules
 * with a codemod count, and a codemod only rewrites code at a reported location. Files that
 * resolve (through `..` or symlinks) outside the project directory are never touched.
 */
export const planFixes = (projectDirectory: string, diagnostics: readonly Diagnostic[]): FixPlan => {
  const projectRoot = fs.realpathSync(path.resolve(projectDirectory));
  const findingsByFile = new Map<string, Map<string, FixLocation[]>>();
  for (const diagnostic of diagnostics) {
    const ruleId = ruleIdOf(diagnostic);
    if (!CODEMODS.has(ruleId)) continue;
    const byRule = findingsByFile.get(diagnostic.filePath) ?? new Map<string, FixLocation[]>();
    const locations = byRule.get(ruleId) ?? [];
    locations.push({ line: diagnostic.line, column: diagnostic.column });
    byRule.set(ruleId, locations);
    findingsByFile.set(diagnostic.filePath, byRule);
  }

  const plan: FixPlan = { entries: [], skippedFiles: [] };
  for (const [reportedPath, findings] of findingsByFile) {
    const filePath = toPosix(reportedPath);
    let absolutePath: string;
    try {
      absolutePath = fs.realpathSync(path.resolve(projectRoot, reportedPath));
    } catch {
      plan.skippedFiles.push({ filePath, reason: "file not found" });
      continue;
    }
    if (!isInside(projectRoot, absolutePath) || !fs.statSync(absolutePath).isFile()) {
      plan.skippedFiles.push({ filePath, reason: "outside the project directory" });
      continue;
    }
    const original = fs.readFileSync(absolutePath, "utf8");
    const result = applyCodemods(original, toPosix(path.relative(projectRoot, absolutePath)), findings);
    if (!result.changed) continue;
    plan.entries.push({ filePath, absolutePath, original, fixed: result.code, fixedRules: result.fixedRules });
  }
  plan.entries.sort((a, b) => a.filePath.localeCompare(b.filePath));
  return plan;
};

export class FixWriteError extends Error {
  constructor(
    message: string,
    readonly written: readonly string[],
  ) {
    super(message);
    this.name = "FixWriteError";
  }
}

/**
 * Writes planned fixes. Each file is replaced atomically (temp file next to it, then rename), so an
 * interrupted run never leaves a half-written file; a file that changed on disk since it was
 * analysed is skipped. Returns the paths written and the paths skipped.
 */
export const writeFixes = (entries: readonly FixPlanEntry[]): { written: string[]; changedOnDisk: string[] } => {
  const written: string[] = [];
  const changedOnDisk: string[] = [];
  for (const entry of entries) {
    const temporaryPath = path.join(
      path.dirname(entry.absolutePath),
      `.${path.basename(entry.absolutePath)}.vue-doctor-fix-${randomBytes(6).toString("hex")}.tmp`,
    );
    try {
      if (fs.readFileSync(entry.absolutePath, "utf8") !== entry.original) {
        changedOnDisk.push(entry.absolutePath);
        continue;
      }
      const { mode } = fs.statSync(entry.absolutePath);
      fs.writeFileSync(temporaryPath, entry.fixed, { encoding: "utf8", flag: "wx", mode: mode & 0o777 });
      fs.renameSync(temporaryPath, entry.absolutePath);
      written.push(entry.absolutePath);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      const reason = error instanceof Error ? error.message : String(error);
      const done = written.length > 0 ? ` Already fixed: ${written.join(", ")}.` : " No file was changed.";
      throw new FixWriteError(`Could not write the fix for ${entry.absolutePath}: ${reason}.${done}`, written);
    }
  }
  return { written, changedOnDisk };
};

/** A project to fix: what the scan of the same run would analyse. */
export interface FixTarget {
  directory: string;
  config: VueDoctorConfig | null;
  /** Changed files in `--diff` mode (relative to `directory`); empty for the whole project. */
  includePaths: string[];
}

export interface FixPassOptions {
  /** `false` (`--no-lint`) leaves nothing to fix; `undefined` follows the config. */
  lint?: boolean;
  cache?: boolean;
  force?: boolean;
  offline?: boolean;
  onDebug?: (namespace: string, message: string) => void;
}

export interface FixPassResult {
  plans: Array<{ directory: string } & FixPlan>;
  /** Lint or template analyzers that failed: their findings could not be fixed. */
  skippedAnalyzers: Array<{ directory: string; analyzer: AnalyzerName; reason: string }>;
}

/**
 * Analyses every target with the lint and template passes only (the analyzers whose findings have
 * codemods), honouring the project config, suppression comments and `--diff` paths, and plans the
 * fixes. Nothing is written: every project is analysed before any file changes, so a project
 * that fails to analyse (no Vue dependency, invalid config) aborts the run with no file touched.
 */
export const planFixPass = async (targets: readonly FixTarget[], options: FixPassOptions = {}): Promise<FixPassResult> => {
  const result: FixPassResult = { plans: [], skippedAnalyzers: [] };
  for (const target of targets) {
    const diagnosis = await diagnose(target.directory, {
      lint: options.lint,
      deadCode: false,
      projectChecks: false,
      audit: false,
      baseline: null,
      config: target.config,
      includePaths: target.includePaths,
      force: options.force,
      offline: options.offline,
      cache: options.cache,
      onDebug: options.onDebug,
    });
    for (const { analyzer, reason } of diagnosis.skipped) {
      result.skippedAnalyzers.push({ directory: target.directory, analyzer, reason });
    }
    result.plans.push({ directory: target.directory, ...planFixes(target.directory, diagnosis.diagnostics) });
  }
  return result;
};

/** Unified diffs of the planned fixes, with paths relative to `displayRoot`. */
export const formatFixDiffs = (entries: readonly FixPlanEntry[], displayRoot: string): string[] => {
  const root = fs.existsSync(displayRoot) ? fs.realpathSync(displayRoot) : displayRoot;
  return entries.map((entry) =>
    createUnifiedDiff(toPosix(path.relative(root, entry.absolutePath)), entry.original, entry.fixed),
  );
};

/** Total fixed findings per rule over the given entries. */
export const countFixedRules = (entries: readonly FixPlanEntry[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    for (const [ruleId, count] of Object.entries(entry.fixedRules)) counts[ruleId] = (counts[ruleId] ?? 0) + count;
  }
  return counts;
};

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * `--fix` for the CLI: analyses the targets, then prints the diffs (`dryRun`, on stdout) or writes
 * the files. Status goes to stderr. Throws (before writing anything) when a project cannot be analysed.
 */
export const runFixPass = async (
  targets: readonly FixTarget[],
  options: FixPassOptions & { dryRun: boolean; displayRoot: string },
): Promise<FixPassResult> => {
  logger.log(options.dryRun ? "Looking for fixable findings (dry run)..." : "Looking for fixable findings...");
  const result = await planFixPass(targets, options);
  for (const { directory, analyzer, reason } of result.skippedAnalyzers) {
    logger.warn(`  ⚠ --fix: the ${analyzer} analyzer did not run for ${directory}, so its findings were not fixed: ${reason}`);
  }
  for (const { directory, skippedFiles } of result.plans) {
    for (const { filePath, reason } of skippedFiles) {
      logger.warn(`  ⚠ --fix: skipped ${path.join(directory, filePath)} (${reason})`);
    }
  }

  const entries = result.plans.flatMap((plan) => plan.entries);
  if (entries.length === 0) {
    logger.log("No fixable findings.");
    return result;
  }
  const counts = countFixedRules(entries);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const byRule = Object.entries(counts)
    .map(([ruleId, count]) => `${ruleId} (${count})`)
    .join(", ");

  if (options.dryRun) {
    output.line(formatFixDiffs(entries, options.displayRoot).join("\n\n"));
    logger.log(`Would fix ${plural(total, "finding")} in ${plural(entries.length, "file")}: ${byRule}. No files were changed.`);
    return result;
  }

  const { written, changedOnDisk } = writeFixes(entries);
  for (const filePath of changedOnDisk) {
    logger.warn(`  ⚠ --fix: skipped ${filePath} because it changed during the run`);
  }
  const writtenEntries = entries.filter((entry) => written.includes(entry.absolutePath));
  const writtenCounts = countFixedRules(writtenEntries);
  const writtenTotal = Object.values(writtenCounts).reduce((sum, count) => sum + count, 0);
  logger.success(
    `Fixed ${plural(writtenTotal, "finding")} in ${plural(writtenEntries.length, "file")}: ${Object.entries(writtenCounts)
      .map(([ruleId, count]) => `${ruleId} (${count})`)
      .join(", ")}.`,
  );
  return result;
};
