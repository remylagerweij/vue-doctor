import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Files the analyzers lint: Vue SFCs and JS/TS modules. */
export const LINTABLE_FILE_PATTERN = /\.(vue|[cm]?[jt]sx?)$/;
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", "dist", "build", "coverage", "out"]);
const GIT_LIST_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

export const normalizeRelativePath = (filePath: string): string =>
  path.posix.normalize(filePath.replace(/\\/g, "/"));

const listFilesWithGit = (rootDirectory: string): string[] | null => {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: rootDirectory, encoding: "utf-8", maxBuffer: GIT_LIST_MAX_BUFFER_BYTES },
  );
  if (result.error || result.status !== 0) return null;
  // Tracked files can be deleted in the working tree; only existing files are lintable.
  return result.stdout
    .split("\0")
    .filter((filePath) => filePath && fs.existsSync(path.join(rootDirectory, filePath)));
};

const walkFiles = (rootDirectory: string): string[] => {
  const files: string[] = [];
  const walk = (directory: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) files.push(path.relative(rootDirectory, fullPath));
    }
  };
  walk(rootDirectory);
  return files;
};

/**
 * Whether `filePath` (relative to `rootDirectory`) lies inside one of `directories` (absolute, or
 * relative to `rootDirectory`).
 */
export const isInsideAnyDirectory = (rootDirectory: string, filePath: string, directories: string[]): boolean =>
  directories.some((directory) => {
    const prefix = normalizeRelativePath(path.relative(rootDirectory, path.resolve(rootDirectory, directory)));
    return prefix !== "" && prefix !== "." && normalizeRelativePath(filePath).startsWith(`${prefix}/`);
  });

/**
 * Lintable source files of a project, relative with forward slashes and sorted: git's view
 * (honours .gitignore) with a plain directory walk as fallback outside git repositories.
 * `excludedDirectories` (e.g. the workspaces nested in a monorepo root) are left out.
 */
export const listProjectSourceFiles = (rootDirectory: string, excludedDirectories: string[] = []): string[] =>
  (listFilesWithGit(rootDirectory) ?? walkFiles(rootDirectory))
    .filter((filePath) => LINTABLE_FILE_PATTERN.test(filePath))
    .map(normalizeRelativePath)
    .filter((filePath) => !isInsideAnyDirectory(rootDirectory, filePath, excludedDirectories))
    .sort();
