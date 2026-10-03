import fs from "node:fs";
import path from "node:path";
import { applyCodemods, createUnifiedDiff } from "./codemods.js";
import { listProjectSourceFiles } from "../utils/list-source-files.js";

export interface FixOptions {
  dryRun?: boolean;
  includePaths?: string[];
}

export interface FixReport {
  filesFixed: number;
  rulesFixed: Record<string, number>;
  diffs: string[];
}

export const runFixes = (
  projectDir: string,
  options: FixOptions = {},
): FixReport => {
  const files = options.includePaths && options.includePaths.length > 0
    ? options.includePaths.map((f) => path.resolve(projectDir, f))
    : listProjectSourceFiles(projectDir).map((f) => path.resolve(projectDir, f));

  let filesFixed = 0;
  const rulesFixed: Record<string, number> = {};
  const diffs: string[] = [];

  for (const fullPath of files) {
    if (!fs.existsSync(fullPath)) continue;

    const relPath = path.relative(projectDir, fullPath).replace(/\\/g, "/");
    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    const { code: newContent, fixedRules, changed } = applyCodemods(content, relPath);

    if (changed) {
      filesFixed++;
      for (const rule of fixedRules) {
        rulesFixed[rule] = (rulesFixed[rule] ?? 0) + 1;
      }

      const diff = createUnifiedDiff(relPath, content, newContent);
      diffs.push(diff);

      if (!options.dryRun) {
        fs.writeFileSync(fullPath, newContent, "utf8");
      }
    }
  }

  return {
    filesFixed,
    rulesFixed,
    diffs,
  };
};
