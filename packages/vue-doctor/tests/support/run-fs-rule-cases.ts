import type { FsRuleCase } from "../../src/plugin/fs-rule-cases.js";
import type { DefinedFsRule } from "../../src/plugin/define-fs-rule.js";
import { runFsRules } from "../../src/plugin/run-fs-rules.js";
import type { Diagnostic } from "../../src/types.js";

/** Runs one filesystem rule against a virtual file tree, as the "project" analyzer would on disk. */
export const runFsRuleCase = (rule: DefinedFsRule, testCase: FsRuleCase): Diagnostic[] => {
  const ignored = new Set(testCase.ignored ?? []);
  const untracked = new Set(testCase.untracked ?? []);
  const allFiles = Object.keys(testCase.files).sort();
  const listed = allFiles.filter((file) => !ignored.has(file));
  const trackedFiles = listed.filter((file) => !untracked.has(file));

  return runFsRules([rule], {
    framework: testCase.framework ?? "vite",
    isGitRepository: testCase.git ?? true,
    trackedFiles,
    projectFiles: listed,
    readFile: (relativePath) => testCase.files[relativePath] ?? null,
    readDirectory: (relativePath) => {
      const prefix = relativePath === "" ? "" : `${relativePath.replace(/\/$/, "")}/`;
      return allFiles
        .filter((file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/"))
        .map((file) => file.slice(prefix.length));
    },
  });
};
