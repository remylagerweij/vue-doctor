import fs from "node:fs";
import { ruleIdOf } from "../plugin/rule-ids.js";
import type { Diagnostic } from "../types.js";

export const DEFAULT_BASELINE_FILENAME = ".vue-doctor-baseline.json";
const BASELINE_VERSION = 1;

interface BaselineEntry {
  fingerprint: string;
  rule: string;
  file: string;
}

/** On-disk format. Deterministic (sorted, no timestamps) so it diffs cleanly in version control. */
interface BaselineFile {
  version: typeof BASELINE_VERSION;
  tool: "vue-doctor";
  findings: BaselineEntry[];
}

export interface BaselineSummary {
  /** Absolute path of the baseline file. */
  path: string;
  /** Findings that are in the baseline. */
  matched: number;
  /** Findings that are not in the baseline. */
  new: number;
  /** Baseline entries no longer found. `null` in diff mode, where unscanned files would count as fixed. */
  fixed: number | null;
}

/** Thrown for a missing or malformed baseline file. The CLI maps it to exit code 2. */
export class BaselineError extends Error {
  constructor(filePath: string, reason: string) {
    super(`Cannot use baseline ${filePath}: ${reason}`);
    this.name = "BaselineError";
  }
}

const ruleKey = ruleIdOf;

export const createBaseline = (diagnostics: Diagnostic[]): BaselineFile => ({
  version: BASELINE_VERSION,
  tool: "vue-doctor",
  findings: diagnostics
    .filter((diagnostic) => diagnostic.fingerprint)
    .map((diagnostic) => ({
      fingerprint: diagnostic.fingerprint as string,
      rule: ruleKey(diagnostic),
      file: diagnostic.filePath,
    }))
    .sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.rule.localeCompare(right.rule) ||
        left.fingerprint.localeCompare(right.fingerprint),
    ),
});

export const writeBaseline = (filePath: string, baseline: BaselineFile): void => {
  fs.writeFileSync(filePath, `${JSON.stringify(baseline, null, 2)}\n`);
};

const isBaselineFile = (value: unknown): value is BaselineFile => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BaselineFile>;
  return (
    candidate.version === BASELINE_VERSION &&
    Array.isArray(candidate.findings) &&
    candidate.findings.every((entry) => typeof entry?.fingerprint === "string")
  );
};

export const readBaseline = (filePath: string): Set<string> => {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    throw new BaselineError(filePath, "the file does not exist (create it with `vue-doctor baseline`)");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new BaselineError(filePath, `invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!isBaselineFile(parsed)) {
    throw new BaselineError(filePath, `expected a version ${BASELINE_VERSION} baseline written by \`vue-doctor baseline\``);
  }
  return new Set(parsed.findings.map((entry) => entry.fingerprint));
};

/** Marks findings present in the baseline as `status: "baseline"` and every other finding as `"new"`. */
export const applyBaseline = (
  diagnostics: Diagnostic[],
  baselineFingerprints: Set<string>,
  baselinePath: string,
  isDiffMode: boolean,
): { diagnostics: Diagnostic[]; summary: BaselineSummary } => {
  const seen = new Set<string>();
  const marked = diagnostics.map((diagnostic): Diagnostic => {
    const isKnown = diagnostic.fingerprint !== undefined && baselineFingerprints.has(diagnostic.fingerprint);
    if (isKnown) seen.add(diagnostic.fingerprint as string);
    return { ...diagnostic, status: isKnown ? "baseline" : "new" };
  });
  const matched = marked.filter((diagnostic) => diagnostic.status === "baseline").length;
  return {
    diagnostics: marked,
    summary: {
      path: baselinePath,
      matched,
      new: marked.length - matched,
      fixed: isDiffMode ? null : baselineFingerprints.size - seen.size,
    },
  };
};
