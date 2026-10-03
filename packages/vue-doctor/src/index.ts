/**
 * Public programmatic API of Vue Doctor.
 *
 * Importing this module has no side effects: it never parses argv, prints, or exits.
 * The CLI (`vue-doctor` bin) is a thin layer on top of `diagnose()`.
 */
export {
  diagnose,
  NoVueDependencyError,
  type AnalyzerName,
  type DiagnoseOptions,
  type DiagnoseResult,
  type ProgressEvent,
  type SkippedAnalyzer,
} from "./core/diagnose.js";
export { createKnipSession, type KnipSession } from "./utils/run-knip.js";
export { calculateScore } from "./utils/calculate-score.js";
export { ConfigError, loadConfig, type LoadedConfig } from "./config/load-config.js";
export { defineConfig } from "./config/define-config.js";
export type { PresetName, RuleEntry, RuleSeverity } from "./config/schema.js";
export type { SuppressedSummary } from "./utils/suppressions.js";
export type {
  Diagnostic,
  Framework,
  ProjectInfo,
  CategoryScore,
  ScoreCap,
  ScoreImpact,
  ScoreResult,
  VueDoctorConfig,
  VueDoctorIgnoreConfig,
} from "./types.js";
