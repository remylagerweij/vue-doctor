import { getRuleMeta } from "../plugin/registry.js";
import type { Diagnostic } from "../types.js";
import { isChangedLine, type ChangedLines } from "../utils/changed-lines.js";
import { normalizeRelativePath } from "../utils/list-source-files.js";

/**
 * Findings about a file as a whole rather than a line of it: dead code (knip), filesystem rules
 * (a committed `.env`, a file in `public/`) and the dependency audit, plus anything without a line.
 * A changed file is what introduces them, so they are kept whenever their file is changed.
 */
const isFileLevel = (diagnostic: Diagnostic): boolean => {
  if (diagnostic.plugin === "knip" || !(diagnostic.line >= 1)) return true;
  const engine = getRuleMeta(diagnostic.plugin, diagnostic.rule)?.engine;
  return engine === "fs" || engine === "audit";
};

/**
 * `--diff-lines`: keeps the findings on a changed line, and file-level findings in a changed file.
 * A finding's line is where it starts.
 */
export const keepChangedLineFindings = (diagnostics: Diagnostic[], changedLines: ChangedLines): Diagnostic[] => {
  const normalized: ChangedLines = {};
  for (const [file, ranges] of Object.entries(changedLines)) normalized[normalizeRelativePath(file)] = ranges;
  return diagnostics.filter((diagnostic) => {
    const file = normalizeRelativePath(diagnostic.filePath);
    if (isFileLevel(diagnostic)) return normalized[file] !== undefined;
    return isChangedLine(normalized, file, diagnostic.line);
  });
};
