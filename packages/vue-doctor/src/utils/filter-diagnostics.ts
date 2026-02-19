import type { Diagnostic, VueDoctorConfig } from "../types.js";
import { matchGlobPattern } from "./match-glob-pattern.js";

export const filterDiagnostics = (
  diagnostics: Diagnostic[],
  config: VueDoctorConfig | null,
): Diagnostic[] => {
  if (!config?.ignore) return diagnostics;

  const ignoredRules = new Set(config.ignore.rules ?? []);
  const ignoredFilePatterns = config.ignore.files ?? [];

  return diagnostics.filter((diagnostic) => {
    const ruleKey = `${diagnostic.plugin}/${diagnostic.rule}`;
    if (ignoredRules.has(ruleKey)) return false;

    if (
      ignoredFilePatterns.length > 0 &&
      ignoredFilePatterns.some((pattern) => matchGlobPattern(diagnostic.filePath, pattern))
    ) {
      return false;
    }

    return true;
  });
};
