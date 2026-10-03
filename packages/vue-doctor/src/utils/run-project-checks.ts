import fs from "node:fs";
import path from "node:path";
import { hashText } from "../core/cache.js";
import type { DefinedFsRule } from "../plugin/define-fs-rule.js";
import { runFsRules } from "../plugin/run-fs-rules.js";
import type { Diagnostic, Framework } from "../types.js";
import type { ProjectFileListing } from "./list-project-files.js";

/**
 * The "project" analyzer: runs the filesystem rules (`engine: "fs"`) against the project on disk.
 * It is read-only, never uses the network and never spawns a process (the git file list is passed
 * in). Every read a rule makes is recorded, so the cache can tell whether a stored result is still
 * valid without running the rules again.
 */

/**
 * Snapshot of everything a run read: `file:<path>` maps to a content hash (`null`: missing),
 * `dir:<path>` to a hash of the directory's file names.
 */
export type ProjectInputs = Record<string, string | null>;

export interface ProjectChecksRun {
  diagnostics: Diagnostic[];
  inputs: ProjectInputs;
}

const hashDirectoryNames = (names: readonly string[]): string => hashText([...names].sort().join("\0"));

const readDirectoryNames = (directory: string): string[] => {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};

/** Current state of one recorded input; `undefined` for a key this module did not produce. */
export const snapshotProjectInput = (directory: string, key: string): string | null | undefined => {
  if (key.startsWith("file:")) {
    try {
      return hashText(fs.readFileSync(path.join(directory, key.slice("file:".length))));
    } catch {
      return null;
    }
  }
  if (key.startsWith("dir:")) return hashDirectoryNames(readDirectoryNames(path.join(directory, key.slice("dir:".length))));
  return undefined;
};

/** Hash of the file lists the rules receive; any added, removed or untracked file changes it. */
export const computeProjectListingKey = (listing: ProjectFileListing, framework: Framework): string =>
  hashText(
    [
      framework,
      listing.isGitRepository ? "git" : "walk",
      listing.trackedFiles.join("\0"),
      "--",
      listing.projectFiles.join("\0"),
    ].join("\n"),
  );

export const runProjectChecks = (
  directory: string,
  framework: Framework,
  rules: readonly DefinedFsRule[],
  listing: ProjectFileListing,
): ProjectChecksRun => {
  const inputs: ProjectInputs = {};
  const diagnostics = runFsRules(rules, {
    framework,
    isGitRepository: listing.isGitRepository,
    trackedFiles: listing.trackedFiles,
    projectFiles: listing.projectFiles,
    readFile: (relativePath) => {
      const key = `file:${relativePath}`;
      try {
        const buffer = fs.readFileSync(path.join(directory, relativePath));
        inputs[key] = hashText(buffer);
        return buffer.toString("utf-8");
      } catch {
        inputs[key] = null;
        return null;
      }
    },
    readDirectory: (relativePath) => {
      const names = readDirectoryNames(path.join(directory, relativePath));
      inputs[`dir:${relativePath}`] = hashDirectoryNames(names);
      return names;
    },
  });
  return { diagnostics, inputs };
};
