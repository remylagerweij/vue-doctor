import fs from "node:fs";
import path from "node:path";
import { resolveRuleKey, ruleIdOf, type RuleIdReporter } from "../plugin/rule-ids.js";
import type { Diagnostic } from "../types.js";

/**
 * Vue Doctor's own suppression comments, applied in memory after all analyzers ran. Only these
 * comments can hide Vue Doctor findings; `eslint-disable` / `oxlint-disable` comments are ignored
 * on purpose (they are counted and reported as `foreignDirectives`).
 *
 * Supported in JS/TS line or block comments, in HTML comments inside `.vue` templates and in `#`
 * comments of `.env` files (findings of the project checks):
 *   vue-doctor-disable-next-line [rules] [-- reason]
 *   vue-doctor-disable-line [rules] [-- reason]
 *   vue-doctor-disable [rules] ... vue-doctor-enable [rules]
 *   vue-doctor-disable-file [rules]
 */

export interface SuppressedSummary {
  count: number;
  /** Suppressed findings per canonical rule ID. */
  byRule: Record<string, number>;
}

interface SuppressionResult {
  diagnostics: Diagnostic[];
  suppressed: SuppressedSummary;
  /** `eslint-disable` / `oxlint-disable` comments seen in files that have findings. */
  foreignDirectives: number;
}

type DirectiveKind = "disable-next-line" | "disable-line" | "disable-file" | "disable" | "enable";

/** `null` means "all rules"; otherwise lower-cased rule keys as written (any accepted spelling). */
type RuleSelector = ReadonlySet<string> | null;

interface RangeEvent {
  line: number;
  column: number;
  kind: "disable" | "enable";
  rules: RuleSelector;
}

interface FileSuppressions {
  fileRules: RuleSelector[];
  lineRules: Map<number, RuleSelector[]>;
  rangeEvents: RangeEvent[];
}

const SUPPRESSION_DIRECTIVE_PATTERN =
  /(?:\/\/+[^\S\n]*|\/\*+\s*|<!--\s*|#[^\S\n]*)vue-doctor-(disable-next-line|disable-line|disable-file|disable|enable)(?![\w-])([^\n]*)/g;

/** Matches the start of a foreign (ESLint/oxlint) disable or enable comment. */
const FOREIGN_DIRECTIVE_PATTERN = /(\/\/+[^\S\n]*|\/\*+\s*|<!--\s*)(eslint|oxlint)-(disable|enable)/g;

const COMMENT_TERMINATOR_PATTERN = /\*\/|-->/;
const REASON_PATTERN = /(^|\s)--(\s.*|$)/;
const RULE_SEPARATOR_PATTERN = /[\s,]+/;

/** Counts `eslint-disable` / `oxlint-disable` style comments in a source text. */
export const countForeignDirectives = (content: string): number =>
  [...content.matchAll(FOREIGN_DIRECTIVE_PATTERN)].length;

/**
 * Makes foreign directives inert without changing the text length (so offsets, lines and columns
 * stay intact): `eslint-disable` becomes `eslint_disable`. Used on in-memory/temp copies only.
 */
export const defuseForeignDirectives = (content: string): string =>
  content.replace(FOREIGN_DIRECTIVE_PATTERN, "$1$2_$3");

export const hasForeignDirectives = (content: string): boolean => {
  FOREIGN_DIRECTIVE_PATTERN.lastIndex = 0;
  const found = FOREIGN_DIRECTIVE_PATTERN.test(content);
  FOREIGN_DIRECTIVE_PATTERN.lastIndex = 0;
  return found;
};

const parseRuleSelector = (rawArguments: string, reporter?: RuleIdReporter): RuleSelector => {
  const terminatorIndex = rawArguments.search(COMMENT_TERMINATOR_PATTERN);
  const withoutTerminator =
    terminatorIndex === -1 ? rawArguments : rawArguments.slice(0, terminatorIndex);
  const withoutReason = withoutTerminator.replace(REASON_PATTERN, "");
  const names = withoutReason
    .split(RULE_SEPARATOR_PATTERN)
    .filter(Boolean)
    .map((name) => name.toLowerCase());
  for (const name of names) reporter?.check(name);
  return names.length === 0 ? null : new Set(names);
};

/** A selector names rules in any accepted spelling: canonical ID, deprecated 1.x alias, `<prefix>/*`. */
const selectorMatches = (selector: RuleSelector, ruleId: string): boolean =>
  selector === null || [...selector].some((key) => resolveRuleKey(key).matches(ruleId));

const computeLineStarts = (content: string): number[] => {
  const lineStarts = [0];
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }
  return lineStarts;
};

const locate = (lineStarts: number[], offset: number): { line: number; column: number } => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: offset - lineStarts[low] + 1 };
};

const parseSuppressions = (content: string, reporter?: RuleIdReporter): FileSuppressions => {
  const suppressions: FileSuppressions = { fileRules: [], lineRules: new Map(), rangeEvents: [] };
  if (!content.includes("vue-doctor-")) return suppressions;

  const lineStarts = computeLineStarts(content);
  const addLineRules = (line: number, selector: RuleSelector): void => {
    const existing = suppressions.lineRules.get(line);
    if (existing) existing.push(selector);
    else suppressions.lineRules.set(line, [selector]);
  };

  for (const match of content.matchAll(SUPPRESSION_DIRECTIVE_PATTERN)) {
    const kind = match[1] as DirectiveKind;
    const selector = parseRuleSelector(match[2], reporter);
    const { line, column } = locate(lineStarts, match.index);

    if (kind === "disable-file") suppressions.fileRules.push(selector);
    else if (kind === "disable-line") addLineRules(line, selector);
    else if (kind === "disable-next-line") addLineRules(line + 1, selector);
    else suppressions.rangeEvents.push({ line, column, kind, rules: selector });
  }

  return suppressions;
};

const isSuppressed = (
  suppressions: FileSuppressions,
  diagnostic: Diagnostic,
  ruleId: string,
): boolean => {
  if (suppressions.fileRules.some((selector) => selectorMatches(selector, ruleId))) return true;

  const lineSelectors = suppressions.lineRules.get(diagnostic.line);
  if (lineSelectors?.some((selector) => selectorMatches(selector, ruleId))) return true;

  // Range directives: the last disable/enable before the finding that mentions the rule wins.
  let disabled = false;
  for (const event of suppressions.rangeEvents) {
    const startsBefore =
      event.line < diagnostic.line ||
      (event.line === diagnostic.line && event.column <= diagnostic.column);
    if (!startsBefore) continue;
    if (selectorMatches(event.rules, ruleId)) disabled = event.kind === "disable";
  }
  return disabled;
};

interface FileScan {
  suppressions: FileSuppressions;
  foreignDirectives: number;
}

const readFileScan = (absolutePath: string, reporter?: RuleIdReporter): FileScan | null => {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return null;
  }
  return {
    suppressions: parseSuppressions(content, reporter),
    foreignDirectives: countForeignDirectives(content),
  };
};

/**
 * Removes findings hidden by `vue-doctor-disable*` comments. Read-only: each file that has
 * findings is read at most once; nothing is ever written.
 */
export const applySuppressions = (
  diagnostics: Diagnostic[],
  rootDirectory: string,
  reporter?: RuleIdReporter,
): SuppressionResult => {
  const scans = new Map<string, FileScan | null>();
  const getScan = (filePath: string): FileScan | null => {
    const absolutePath = path.resolve(rootDirectory, filePath);
    if (!scans.has(absolutePath)) scans.set(absolutePath, readFileScan(absolutePath, reporter));
    return scans.get(absolutePath) ?? null;
  };

  const kept: Diagnostic[] = [];
  const byRule: Record<string, number> = {};
  let suppressedCount = 0;

  for (const diagnostic of diagnostics) {
    const scan = getScan(diagnostic.filePath);
    const ruleId = ruleIdOf(diagnostic);
    if (scan && isSuppressed(scan.suppressions, diagnostic, ruleId)) {
      suppressedCount++;
      byRule[ruleId] = (byRule[ruleId] ?? 0) + 1;
    } else {
      kept.push(diagnostic);
    }
  }

  let foreignDirectives = 0;
  for (const scan of scans.values()) foreignDirectives += scan?.foreignDirectives ?? 0;

  return {
    diagnostics: kept,
    suppressed: { count: suppressedCount, byRule },
    foreignDirectives,
  };
};
