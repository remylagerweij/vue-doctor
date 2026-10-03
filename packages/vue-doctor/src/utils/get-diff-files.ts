import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SOURCE_FILE_PATTERN, DEFAULT_BRANCH_CANDIDATES } from "../constants.js";
import type { DiffInfo } from "../types.js";

const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

interface GitResult {
  ok: boolean;
  stdout: string;
}

const runGit = (directory: string, args: string[]): GitResult => {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf-8",
    stdio: "pipe",
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  if (result.error) return { ok: false, stdout: "" };
  return { ok: result.status === 0, stdout: result.stdout ?? "" };
};

// Resolves a ref to a commit SHA. `rev-parse --verify` receives "<ref>^{commit}", which
// never starts with "-" because getDiffInfo rejects such refs up front.
const resolveCommit = (directory: string, ref: string): string | null => {
  const result = runGit(directory, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (!result.ok) return null;
  const sha = result.stdout.trim();
  return sha.length > 0 ? sha : null;
};

const getCurrentBranch = (directory: string): string | null => {
  const result = runGit(directory, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!result.ok) return null;
  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
};

const getDefaultBranch = (directory: string): string | null => {
  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    if (resolveCommit(directory, candidate)) return candidate;
  }
  return null;
};

// NUL-separated output (-z) avoids git's quoting of paths with unusual characters.
const splitNullSeparated = (output: string): string[] =>
  output.split("\0").filter((entry) => entry.length > 0);

const isExistingFile = (directory: string, relativePath: string): boolean => {
  try {
    return fs.statSync(path.join(directory, relativePath)).isFile();
  } catch {
    return false;
  }
};

// Files differing from `commit` in the working tree (staged + unstaged) plus untracked,
// non-ignored files. `--relative` and `ls-files` both yield paths relative to `directory`,
// and `--relative` also limits the diff to that directory (monorepo sub-projects).
const collectChangedFiles = (directory: string, commit: string): string[] | null => {
  const diff = runGit(directory, [
    "diff",
    "--relative",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
    commit,
    "--",
  ]);
  if (!diff.ok) return null;

  const untracked = runGit(directory, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (!untracked.ok) return null;

  const files = new Set<string>();
  for (const entry of [
    ...splitNullSeparated(diff.stdout),
    ...splitNullSeparated(untracked.stdout),
  ]) {
    const normalized = entry.replace(/\\/g, "/");
    if (isExistingFile(directory, normalized)) files.add(normalized);
  }
  return [...files].sort();
};

export const filterSourceFiles = (files: string[]): string[] =>
  files.filter((file) => SOURCE_FILE_PATTERN.test(file));

/**
 * Lists the files changed in `directory` (a project directory, possibly nested inside a
 * larger git repository) versus a base branch, plus uncommitted and untracked files.
 * Paths are relative to `directory`. Throws on an invalid `explicitBaseBranch`; every
 * other failure is reported as `{ status: "unavailable", reason }`.
 */
export const getDiffInfo = (directory: string, explicitBaseBranch?: string): DiffInfo => {
  if (explicitBaseBranch !== undefined) {
    if (explicitBaseBranch.trim().length === 0) {
      throw new Error("Invalid --diff value: the branch name must not be empty.");
    }
    if (explicitBaseBranch.startsWith("-")) {
      throw new Error(
        `Invalid --diff value "${explicitBaseBranch}": a branch name must not start with "-".`,
      );
    }
  }

  const insideWorkTree = runGit(directory, ["rev-parse", "--is-inside-work-tree"]);
  if (!insideWorkTree.ok || insideWorkTree.stdout.trim() !== "true") {
    return { status: "unavailable", reason: "not a git repository" };
  }

  const headCommit = resolveCommit(directory, "HEAD");
  const currentBranch = getCurrentBranch(directory);
  if (!headCommit || !currentBranch) {
    return { status: "unavailable", reason: "the repository has no commits yet" };
  }

  if (explicitBaseBranch !== undefined && !resolveCommit(directory, explicitBaseBranch)) {
    return {
      status: "unavailable",
      reason: `unknown branch or ref "${explicitBaseBranch}"`,
    };
  }

  const requestedBase = explicitBaseBranch ?? getDefaultBranch(directory);
  const isBranchComparison = requestedBase !== null && requestedBase !== currentBranch;
  const baseBranch = isBranchComparison ? requestedBase : currentBranch;
  let comparisonCommit = headCommit;

  if (isBranchComparison) {
    const mergeBase = runGit(directory, ["merge-base", requestedBase, headCommit]);
    const mergeBaseCommit = mergeBase.ok ? mergeBase.stdout.trim() : "";
    if (!mergeBaseCommit) {
      return {
        status: "unavailable",
        reason:
          `could not find a merge base between "${requestedBase}" and HEAD ` +
          "(unrelated histories or a shallow clone; try fetching more history)",
      };
    }
    comparisonCommit = mergeBaseCommit;
  }

  const changedFiles = collectChangedFiles(directory, comparisonCommit);
  if (!changedFiles) {
    return { status: "unavailable", reason: "git failed to list the changed files" };
  }

  const isCurrentChanges = !isBranchComparison;
  if (changedFiles.length === 0) {
    return {
      status: "no-changes",
      currentBranch,
      baseBranch,
      mergeBase: comparisonCommit,
      isCurrentChanges,
    };
  }

  return {
    status: "ok",
    currentBranch,
    baseBranch,
    mergeBase: comparisonCommit,
    changedFiles,
    isCurrentChanges,
  };
};
