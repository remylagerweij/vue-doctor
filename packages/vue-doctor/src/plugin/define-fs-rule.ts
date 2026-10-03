import type { Framework } from "../types.js";
import type { RuleMeta } from "./define-rule.js";

/**
 * Filesystem rules (`engine: "fs"`): project-level checks that look at files rather than at an AST
 * (committed `.env` files, lockfiles, sensitive files in `public/`). They are defined next to the
 * other rules as `src/plugin/rules/<category>/<id>.ts` with `defineFsRule`, and run by the
 * "project" analyzer (see utils/run-project-checks.ts) against a read-only view of the project.
 *
 * A rule never touches the disk itself: everything it may read comes through `FsRuleContext`, which
 * is what makes the analyzer cacheable (every read is recorded) and the rules testable on virtual
 * file trees (see `fs-rule-cases.ts`).
 */

/** One finding. Paths are relative to the project root; line and column are 1-based (default 1). */
export interface FsFinding {
  file: string;
  line?: number;
  column?: number;
  /** Must never contain secret values; name the key or file, not its content. */
  message: string;
}

export interface FsRuleContext {
  framework: Framework;
  /**
   * Whether the project directory is inside a git work tree. Without git, `trackedFiles` falls back
   * to every file found by walking the project, so rules that are about what is *committed* should
   * stay silent when this is `false`.
   */
  isGitRepository: boolean;
  /**
   * Files tracked by git (`git ls-files`), or, outside a git repository, the walked files.
   * Relative, forward slashes, sorted. Excludes `node_modules` and nested workspaces.
   */
  trackedFiles: readonly string[];
  /**
   * Tracked files plus untracked files that are not ignored. Ignored files (`.env`, build output)
   * are not listed; use `readDirectory` to see them.
   */
  projectFiles: readonly string[];
  /** File content as UTF-8, or `null` when the file does not exist or is unreadable. */
  readFile: (relativePath: string) => string | null;
  /** Names of the files directly inside a directory (`""` is the project root), ignored ones included. */
  readDirectory: (relativePath: string) => readonly string[];
  report: (finding: FsFinding) => void;
}

/** What a rule file passes to `defineFsRule`; the engine is implied. */
type FsRuleMeta = Omit<RuleMeta, "engine">;

export interface DefinedFsRule {
  /** Registry metadata, same shape as for the other engines. */
  ruleMeta: RuleMeta;
  check: (context: FsRuleContext) => void;
}

interface FsRuleDefinition {
  meta: FsRuleMeta;
  check: (context: FsRuleContext) => void;
}

export const defineFsRule = ({ meta, check }: FsRuleDefinition): DefinedFsRule => ({
  ruleMeta: { ...meta, engine: "fs" },
  check,
});

/** Any registered rule module: oxlint rules carry `create`, fs rules `check`. */
export const isFsRule = (rule: { ruleMeta: RuleMeta }): rule is DefinedFsRule => rule.ruleMeta.engine === "fs";
