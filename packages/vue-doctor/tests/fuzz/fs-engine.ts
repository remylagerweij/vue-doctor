import { performance } from "node:perf_hooks";
import type { Framework } from "../../src/types.js";
import { FS_RULES } from "../../src/plugin/registry.js";
import { runFsRules, type FsEnvironment } from "../../src/plugin/run-fs-rules.js";
import type { TreeInput } from "./types.js";

export interface FsRuleOutcome {
  rule: string;
  ms: number;
  error?: string;
  findings: { file: string; line: number; message: string }[];
}

/** The read-only project view a rule gets, built from a virtual file tree (as tests/support does). */
const toEnvironment = (tree: TreeInput): FsEnvironment => {
  const ignored = new Set(tree.ignored ?? []);
  const untracked = new Set(tree.untracked ?? []);
  const allFiles = Object.keys(tree.files).sort();
  const listed = allFiles.filter((file) => !ignored.has(file));
  return {
    framework: (tree.framework ?? "vite") as Framework,
    isGitRepository: tree.git ?? true,
    trackedFiles: listed.filter((file) => !untracked.has(file)),
    projectFiles: listed,
    readFile: (relativePath) => tree.files[relativePath] ?? null,
    readDirectory: (relativePath) => {
      const prefix = relativePath === "" ? "" : `${relativePath.replace(/\/$/, "")}/`;
      return allFiles
        .filter((file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/"))
        .map((file) => file.slice(prefix.length));
    },
  };
};

/** Runs every filesystem rule on the tree, one at a time, timing each and catching what it throws. */
export const runFsRulesInstrumented = (tree: TreeInput): FsRuleOutcome[] => {
  const environment = toEnvironment(tree);
  return FS_RULES.map((rule) => {
    const start = performance.now();
    try {
      const findings = runFsRules([rule], environment).map(({ filePath, line, message }) => ({ file: filePath, line, message }));
      return { rule: rule.ruleMeta.id, ms: performance.now() - start, findings };
    } catch (error) {
      const text = error instanceof Error ? `${error.name}: ${error.message}\n${(error.stack ?? "").split("\n").slice(1, 5).join("\n")}` : String(error);
      return { rule: rule.ruleMeta.id, ms: performance.now() - start, error: text, findings: [] };
    }
  });
};
