import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * The directory that SARIF `%SRCROOT%` stands for: the git repository root containing `directory`
 * (what GitHub code scanning resolves paths against), else the current working directory.
 */
const findSourceRoot = (directory: string): string => {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: directory, encoding: "utf-8" });
  const topLevel = result.status === 0 ? result.stdout.trim() : "";
  return topLevel ? path.resolve(topLevel) : process.cwd();
};

/** POSIX path from the source root to `directory` (`""` when they are the same). */
export const relativeToSourceRoot = (directory: string): string =>
  path.relative(findSourceRoot(directory), path.resolve(directory)).split(path.sep).join("/");
