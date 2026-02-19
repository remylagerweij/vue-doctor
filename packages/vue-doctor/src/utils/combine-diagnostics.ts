import { VUE_FILE_PATTERN } from "../constants.js";
import type { Diagnostic, VueDoctorConfig } from "../types.js";
import { filterDiagnostics } from "./filter-diagnostics.js";

export const computeVueIncludePaths = (includePaths: string[]): string[] =>
  includePaths.filter((filePath) => VUE_FILE_PATTERN.test(filePath));

export const combineDiagnostics = (
  lintDiagnostics: Diagnostic[],
  deadCodeDiagnostics: Diagnostic[],
  _directory: string,
  _isDiffMode: boolean,
  userConfig: VueDoctorConfig | null,
): Diagnostic[] => {
  const allDiagnostics = [...lintDiagnostics, ...deadCodeDiagnostics];
  return filterDiagnostics(allDiagnostics, userConfig);
};
