/** Which analyzer path runs a rule: oxlint (script AST), the ESLint template pass, or the project-file rules. */
export type FuzzEngine = "oxlint" | "template" | "fs";

export type Oracle = "crash" | "slowness" | "metamorphic";

/** A single file fed to the script and template engines. */
export interface SourceInput {
  /** Stable across runs for the same corpus (and seed, for mutations): used by the allowlist. */
  id: string;
  /** Where the input comes from: `cases`, `template-cases`, `fixture`, `benchmark`, `stress` or `mutation`. */
  origin: string;
  /** Path relative to the project root; decides `.vue`, `server/`, test-file semantics. */
  filename: string;
  code: string;
  /** The rule (flat id) this input was written for, when it comes from a rule's cases. */
  owner?: string;
  /** Options the owning rule runs with for this input. */
  ruleOptions?: Record<string, unknown>;
  /** The input only makes sense for some engines; by default script files go to oxlint and `.vue` files to both. */
  engines?: readonly FuzzEngine[];
  /** Set on mutated inputs: which mutation produced it (`mutation:poison-identifier`). */
  mutation?: string;
}

/** A virtual project fed to the filesystem rules. */
export interface TreeInput {
  id: string;
  origin: string;
  files: Record<string, string>;
  ignored?: string[];
  untracked?: string[];
  git?: boolean;
  framework?: "vite" | "nuxt" | string;
  owner?: string;
}

/** One finding as the oracles compare it. Columns are deliberately absent (they may shift). */
export interface NormalizedFinding {
  rule: string;
  file: string;
  line: number;
  message: string;
}

export interface Failure {
  oracle: Oracle;
  engine: FuzzEngine;
  /** Flat rule id (`no-eval`, `vue/require-v-for-key`), or `*` when no single rule is to blame. */
  rule: string;
  input: string;
  /** `baseline`, a metamorphic transform id (`crlf`) or a mutation id. */
  variant: string;
  detail: string;
}

export interface RuleTiming {
  rule: string;
  file: string;
  ms: number;
  error?: string;
}
