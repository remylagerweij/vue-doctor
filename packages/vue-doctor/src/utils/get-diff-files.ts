import { spawnSync } from "node:child_process";
import { SOURCE_FILE_PATTERN, DEFAULT_BRANCH_CANDIDATES } from "../constants.js";
import type { DiffInfo } from "../types.js";

const getCurrentBranch = (directory: string): string | null => {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: directory,
    encoding: "utf-8",
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
};

const getDefaultBranch = (directory: string): string | null => {
  for (const candidate of DEFAULT_BRANCH_CANDIDATES) {
    const result = spawnSync("git", ["rev-parse", "--verify", candidate], {
      cwd: directory,
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (result.status === 0) return candidate;
  }
  return null;
};

const getChangedFiles = (directory: string, baseBranch: string): string[] => {
  const mergeBase = spawnSync("git", ["merge-base", baseBranch, "HEAD"], {
    cwd: directory,
    encoding: "utf-8",
  });
  if (mergeBase.error || mergeBase.status !== 0) return [];

  const diffResult = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", mergeBase.stdout.trim()],
    { cwd: directory, encoding: "utf-8" },
  );
  if (diffResult.error || diffResult.status !== 0) return [];

  return diffResult.stdout
    .split("\n")
    .filter((line) => line.length > 0);
};

const getUncommittedChanges = (directory: string): string[] => {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
    { cwd: directory, encoding: "utf-8" },
  );
  if (result.error || result.status !== 0) return [];

  const stagedResult = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", "--cached"],
    { cwd: directory, encoding: "utf-8" },
  );
  const staged = stagedResult.status === 0
    ? stagedResult.stdout.split("\n").filter((line) => line.length > 0)
    : [];

  const unstaged = result.stdout.split("\n").filter((line) => line.length > 0);
  return [...new Set([...staged, ...unstaged])];
};

export const filterSourceFiles = (files: string[]): string[] =>
  files.filter((file) => SOURCE_FILE_PATTERN.test(file));

export const getDiffInfo = (
  directory: string,
  explicitBaseBranch?: string,
): DiffInfo | null => {
  const currentBranch = getCurrentBranch(directory);
  if (!currentBranch) return null;

  const baseBranch = explicitBaseBranch ?? getDefaultBranch(directory);

  if (!baseBranch || currentBranch === baseBranch) {
    const uncommittedChanges = getUncommittedChanges(directory);
    if (uncommittedChanges.length === 0) return null;
    return {
      currentBranch,
      baseBranch: currentBranch,
      changedFiles: uncommittedChanges,
      isCurrentChanges: true,
    };
  }

  const changedFiles = getChangedFiles(directory, baseBranch);
  if (changedFiles.length === 0) {
    const uncommittedChanges = getUncommittedChanges(directory);
    if (uncommittedChanges.length === 0) return null;
    return {
      currentBranch,
      baseBranch,
      changedFiles: uncommittedChanges,
      isCurrentChanges: true,
    };
  }

  return {
    currentBranch,
    baseBranch,
    changedFiles,
  };
};
