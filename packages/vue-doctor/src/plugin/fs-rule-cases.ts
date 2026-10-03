import type { Framework } from "../types.js";

/**
 * Test cases for filesystem rules, colocated as `<rule-id>.cases.ts` (default export). A case is a
 * virtual file tree, so no disk or git repository is needed; tests/rules/rule-cases.test.ts runs
 * every case through `runFsRules`, the same code the "project" analyzer uses.
 */
export interface FsRuleCase {
  /** Short description of what the case demonstrates; shown in the test name. */
  name: string;
  /** Project files by relative path (forward slashes) and content. */
  files: Record<string, string>;
  /**
   * Files that exist but are git-ignored: readable through `readFile` / `readDirectory`, but listed
   * in neither `trackedFiles` nor `projectFiles`. Typical for a local `.env`.
   */
  ignored?: string[];
  /** Files that exist and are not ignored but not committed either (`projectFiles` only). */
  untracked?: string[];
  /** Whether the project is a git repository. Default: true. */
  git?: boolean;
  /** Default: `"vite"`. */
  framework?: Framework;
}

export interface ExpectedFsFinding {
  file: string;
  /** When given, the finding must point at this 1-based line. */
  line?: number;
}

export interface InvalidFsRuleCase extends FsRuleCase {
  /** Exactly these findings of the rule, in file and line order. */
  findings: ExpectedFsFinding[];
}

export interface FsRuleCases {
  /** Realistic near-misses that must not be reported. */
  valid: FsRuleCase[];
  /** Trees the rule must report. */
  invalid: InvalidFsRuleCase[];
}
