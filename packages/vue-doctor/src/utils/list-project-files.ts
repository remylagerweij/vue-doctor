import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isInsideAnyDirectory, normalizeRelativePath } from "./list-source-files.js";

/** Directories the fallback walk never enters (git ignores them in practice). */
const WALK_SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage", "out", ".nuxt", ".output"]);
const GIT_LIST_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

export interface ProjectFileListing {
  /** Whether the directory is inside a git work tree; without it `trackedFiles` is every walked file. */
  isGitRepository: boolean;
  /** Files tracked by git, or all walked files outside git. Relative, forward slashes, sorted. */
  trackedFiles: string[];
  /** Tracked plus untracked-but-not-ignored files (equal to `trackedFiles` outside git). */
  projectFiles: string[];
}

const runGitList = (rootDirectory: string, args: string[]): string[] | null => {
  const result = spawnSync("git", ["ls-files", "-z", ...args], {
    cwd: rootDirectory,
    encoding: "utf-8",
    maxBuffer: GIT_LIST_MAX_BUFFER_BYTES,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.split("\0").filter(Boolean);
};

/** Every file below the directory, dotfiles included (`.env`), without dependency and build directories. */
const walkAllFiles = (rootDirectory: string): string[] => {
  const files: string[] = [];
  const walk = (directory: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!WALK_SKIPPED_DIRECTORIES.has(entry.name)) walk(path.join(directory, entry.name));
      } else if (entry.isFile()) {
        files.push(path.relative(rootDirectory, path.join(directory, entry.name)));
      }
    }
  };
  walk(rootDirectory);
  return files;
};

/**
 * The files the project checks look at. Uses git (`ls-files`, so `.gitignore` is honoured and
 * "tracked" is exact) and falls back to a directory walk outside git repositories. Files inside
 * `excludedDirectories` (nested monorepo workspaces, scanned on their own) are left out.
 */
export const listProjectFiles = (rootDirectory: string, excludedDirectories: string[] = []): ProjectFileListing => {
  const tracked = runGitList(rootDirectory, ["--cached"]);
  const untracked = tracked ? runGitList(rootDirectory, ["--others", "--exclude-standard"]) : null;

  const normalize = (files: string[]): string[] =>
    files
      .map(normalizeRelativePath)
      .filter((filePath) => !isInsideAnyDirectory(rootDirectory, filePath, excludedDirectories))
      // A tracked file deleted in the working tree is not part of the project as it is now.
      .filter((filePath) => fs.existsSync(path.join(rootDirectory, filePath)))
      .sort();

  if (!tracked) {
    const walked = normalize(walkAllFiles(rootDirectory));
    return { isGitRepository: false, trackedFiles: walked, projectFiles: walked };
  }
  const trackedFiles = normalize(tracked);
  return {
    isGitRepository: true,
    trackedFiles,
    projectFiles: [...new Set([...trackedFiles, ...normalize(untracked ?? [])])].sort(),
  };
};
