import type { Diagnostic, ScanOptions, ScanResult, VueDoctorConfig } from "./types.js";
import { calculateScore } from "./utils/calculate-score.js";
import { combineDiagnostics, computeVueIncludePaths } from "./utils/combine-diagnostics.js";
import { discoverProject } from "./utils/discover-project.js";
import { loadConfig } from "./utils/load-config.js";
import { resolveNodeForOxlint } from "./utils/resolve-compatible-node.js";
import { runKnip } from "./utils/run-knip.js";
import { runOxlint } from "./utils/run-oxlint.js";

export interface DiagnoseOptions {
  lint?: boolean;
  deadCode?: boolean;
  includePaths?: string[];
}

export interface DiagnoseResult {
  diagnostics: Diagnostic[];
  score: number | null;
  label: string | null;
}

export const diagnose = async (
  directory: string,
  options: DiagnoseOptions = {},
): Promise<DiagnoseResult> => {
  const projectInfo = discoverProject(directory);
  const userConfig = loadConfig(directory);

  if (!projectInfo.vueVersion) {
    throw new Error("No Vue dependency found in package.json");
  }

  const includePaths = options.includePaths ?? [];
  const isDiffMode = includePaths.length > 0;
  const vueIncludePaths = computeVueIncludePaths(includePaths);

  let lintDiagnostics: Diagnostic[] = [];
  let deadCodeDiagnostics: Diagnostic[] = [];

  if (options.lint !== false) {
    const resolvedNode = resolveNodeForOxlint();
    if (resolvedNode) {
      lintDiagnostics = await runOxlint(
        directory,
        projectInfo.hasTypeScript,
        projectInfo.framework,
        isDiffMode ? vueIncludePaths : undefined,
        resolvedNode.binaryPath,
      );
    }
  }

  if (options.deadCode !== false && !isDiffMode) {
    deadCodeDiagnostics = await runKnip(directory);
  }

  const diagnostics = combineDiagnostics(
    lintDiagnostics,
    deadCodeDiagnostics,
    directory,
    isDiffMode,
    userConfig,
  );

  const scoreResult = await calculateScore(diagnostics);

  return {
    diagnostics,
    score: scoreResult?.score ?? null,
    label: scoreResult?.label ?? null,
  };
};
