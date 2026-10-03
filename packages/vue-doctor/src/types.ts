export type Framework = "nuxt" | "vite" | "quasar" | "vuecli" | "unknown";

export interface ProjectInfo {
  rootDirectory: string;
  projectName: string;
  vueVersion: string | null;
  framework: Framework;
  hasTypeScript: boolean;
  sourceFileCount: number;
}

interface OxlintSpan {
  offset: number;
  length: number;
  line: number;
  column: number;
}

interface OxlintLabel {
  label: string;
  span: OxlintSpan;
}

export interface OxlintDiagnostic {
  message: string;
  code: string;
  severity: "warning" | "error";
  causes: string[];
  url: string;
  help: string;
  filename: string;
  labels: OxlintLabel[];
  related: unknown[];
}

export interface OxlintOutput {
  diagnostics: OxlintDiagnostic[];
  number_of_files: number;
  number_of_rules: number;
}

export interface Diagnostic {
  filePath: string;
  plugin: string;
  /** `<plugin>/<rule>` is the canonical rule ID: `vue-doctor` + `<category>/<rule>`, `knip` + `<type>`; template rules carry `vue/<rule>`. */
  rule: string;
  severity: "error" | "warning";
  message: string;
  help: string;
  line: number;
  column: number;
  category: string;
  weight?: number;
  /** Stable ID (rule + file + normalized source line), unchanged when code moves within a file. */
  fingerprint?: string;
  /** Set when a reference point exists (baseline file or base branch): whether this finding is new. */
  status?: "new" | "existing" | "baseline";
}

export interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

export interface DependencyInfo {
  vueVersion: string | null;
  framework: Framework;
}

/** A ceiling on the overall score triggered by a security finding. */
export interface ScoreCap {
  value: number;
  reason: "security-error" | "critical-secret";
  /** Canonical ID of a rule that triggers the cap. */
  ruleId: string;
}

/** Score of the findings in one category (same penalty model, never capped). */
export interface CategoryScore {
  category: string;
  score: number;
  label: string;
  errors: number;
  warnings: number;
}

/** Overall score gain from fixing every finding of one rule. */
export interface ScoreImpact {
  ruleId: string;
  gain: number;
}

export interface ScoreResult {
  /** Version of the score formula (see docs/guide/scoring.md). */
  version: number;
  /** Overall score after caps. */
  score: number;
  label: string;
  /** Score before caps. */
  rawScore: number;
  /** The cap that lowered the score; `null` when none applied. */
  cap: ScoreCap | null;
  /** Categories with findings, worst first. */
  categories: CategoryScore[];
  /** Rules whose fix would raise the score, largest gain first. */
  impact: ScoreImpact[];
}

export interface ScanOptions {
  lint?: boolean;
  deadCode?: boolean;
  verbose?: boolean;
  scoreOnly?: boolean;
  /** See DiagnoseOptions.cache. */
  cache?: boolean;
  /** Print per-analyzer timings to stderr. */
  timings?: boolean;
  /** See DiagnoseOptions.offline. */
  offline?: boolean;
  /** See DiagnoseOptions.audit. */
  audit?: boolean;
  includePaths?: string[];
  /** Structured output (--format json|jsonl): suppresses the text report; the caller prints it. */
  json?: boolean;
  force?: boolean;
  /** Project config, already loaded by the caller (`null`: none). Loaded by diagnose() when omitted. */
  config?: import("./config/schema.js").VueDoctorConfig | null;
  /** Share one knip run with other projects of the monorepo; see DiagnoseOptions.knipSession. */
  knipSession?: import("./utils/run-knip.js").KnipSession;
  /** Baseline file; see DiagnoseOptions.baseline. */
  baseline?: string | null;
}

export interface DiffReady {
  status: "ok";
  currentBranch: string;
  baseBranch: string;
  /** Commit the working tree was compared against (merge-base, or HEAD for current changes). */
  mergeBase: string;
  /** Existing files, relative to the project directory, with forward slashes. */
  changedFiles: string[];
  /** True when only uncommitted/untracked changes are compared (no branch comparison). */
  isCurrentChanges: boolean;
}

export interface DiffNoChanges {
  status: "no-changes";
  currentBranch: string;
  baseBranch: string;
  mergeBase: string;
  isCurrentChanges: boolean;
}

export interface DiffUnavailable {
  status: "unavailable";
  reason: string;
}

export type DiffInfo = DiffReady | DiffNoChanges | DiffUnavailable;

export interface WorkspacePackage {
  name: string;
  directory: string;
}

export interface CleanedDiagnostic {
  message: string;
  help: string;
}

export type { VueDoctorConfig, VueDoctorIgnoreConfig } from "./config/schema.js";
