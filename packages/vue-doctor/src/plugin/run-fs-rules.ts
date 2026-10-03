import type { Diagnostic } from "../types.js";
import type { DefinedFsRule, FsRuleContext } from "./define-fs-rule.js";
import { PLUGIN_NAME, toDiagnosticRule } from "./registry.js";

/** What the caller provides; `report` is wired per rule. */
export type FsEnvironment = Omit<FsRuleContext, "report">;

const normalizeFile = (file: string): string => file.replace(/\\/g, "/").replace(/^\.\//, "");

/**
 * Runs filesystem rules against an environment and returns their findings as diagnostics, in the
 * same shape the other engines produce (so config severities, ignores, suppressions, baseline and
 * reports treat them alike). Used by the "project" analyzer (disk) and by the rule-cases harness
 * (virtual file trees).
 */
export const runFsRules = (rules: readonly DefinedFsRule[], environment: FsEnvironment): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const { ruleMeta, check } of rules) {
    const severity = ruleMeta.defaultSeverity;
    if (severity === "off") continue;
    check({
      ...environment,
      report: (finding) => {
        diagnostics.push({
          filePath: normalizeFile(finding.file),
          plugin: PLUGIN_NAME,
          rule: toDiagnosticRule(ruleMeta),
          severity,
          message: finding.message,
          help: ruleMeta.help,
          line: finding.line ?? 1,
          column: finding.column ?? 1,
          category: ruleMeta.category,
        });
      },
    });
  }
  // Rules and files are visited in a stable order, but sort anyway so output never depends on rule order.
  return diagnostics.sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line || a.rule.localeCompare(b.rule),
  );
};
