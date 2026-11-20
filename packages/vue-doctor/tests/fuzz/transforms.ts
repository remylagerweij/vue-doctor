import type { TreeInput } from "./types.js";
import { analyzeScript, findScriptBlocks, findTopLevelBlockLines, type ScriptStructure } from "./source-structure.js";

// Metamorphic transforms: rewrites that must not change what a rule reports, except where it
// reports it. Every transform returns `null` when it does not apply to an input (nothing to
// change, or it could not be proven safe), so the oracle never compares an unsafe rewrite.

export interface TransformResult {
  code: string;
  /** Where a line of the original file ended up (identity for rewrites that keep the line count). */
  lineMap: (line: number) => number;
}

export interface Transform {
  id: string;
  description: string;
  apply: (code: string, filename: string) => TransformResult | null;
}

const IDENTITY = (line: number): number => line;

const isSfc = (filename: string): boolean => filename.endsWith(".vue");
const isScriptFile = (filename: string): boolean => /\.[cm]?[jt]sx?$/.test(filename);

interface Insertion {
  /** Original 1-based line the new lines were inserted before. */
  beforeLine: number;
  count: number;
}

const lineMapFor = (insertions: readonly Insertion[]): ((line: number) => number) => {
  if (insertions.length === 0) return IDENTITY;
  return (line) => line + insertions.reduce((shift, { beforeLine, count }) => (beforeLine <= line ? shift + count : shift), 0);
};

/** Runs the steps in order, each on the previous output; `null` when none of them applied. */
const runSteps = (code: string, steps: readonly ((code: string) => TransformResult | null)[]): TransformResult | null => {
  let current = code;
  let lineMap = IDENTITY;
  let applied = false;
  for (const step of steps) {
    const result = step(current);
    if (!result) continue;
    applied = true;
    const previousMap = lineMap;
    lineMap = (line) => result.lineMap(previousMap(line));
    current = result.code;
  }
  return applied ? { code: current, lineMap } : null;
};

interface ScriptEdit {
  content: string;
  insertions: Insertion[];
}

/** Applies a line-based edit to every script of the file (the whole file for plain scripts). */
const editScripts = (
  code: string,
  filename: string,
  edit: (structure: ScriptStructure, sfc: boolean) => ScriptEdit | null,
): TransformResult | null => {
  if (isScriptFile(filename)) {
    const structure = analyzeScript(code);
    const result = structure ? edit(structure, false) : null;
    return result && result.content !== code ? { code: result.content, lineMap: lineMapFor(result.insertions) } : null;
  }
  if (!isSfc(filename)) return null;

  let output = "";
  let cursor = 0;
  const insertions: Insertion[] = [];
  for (const block of findScriptBlocks(code)) {
    const structure = analyzeScript(block.content);
    const result = structure ? edit(structure, true) : null;
    if (!result || result.content === block.content) continue;
    output += code.slice(cursor, block.start) + result.content;
    cursor = block.end;
    for (const insertion of result.insertions) {
      insertions.push({ beforeLine: block.firstLine + insertion.beforeLine - 1, count: insertion.count });
    }
  }
  if (cursor === 0) return null;
  return { code: output + code.slice(cursor), lineMap: lineMapFor(insertions) };
};

const insertLinesBefore = (structure: ScriptStructure, sfc: boolean, text: (indent: string) => string): ScriptEdit | null => {
  // In an SFC the first local line is the rest of the `<script>` tag's line: nothing goes above it.
  const targets = structure.insertionLines.filter((line) => !sfc || line > 1);
  if (targets.length === 0) return null;
  const output: string[] = [];
  const wanted = new Set(targets);
  structure.lines.forEach((line, index) => {
    if (wanted.has(index + 1)) output.push(text(/^[ \t]*/.exec(line)?.[0] ?? ""));
    output.push(line);
  });
  return { content: output.join("\n"), insertions: targets.map((beforeLine) => ({ beforeLine, count: 1 })) };
};

/** Inserts a line before every top-level block of a single-file component. */
const insertBeforeBlocks = (code: string, filename: string, text: string): TransformResult | null => {
  if (!isSfc(filename)) return null;
  const targets = findTopLevelBlockLines(code);
  if (targets.length === 0) return null;
  const wanted = new Set(targets);
  const output: string[] = [];
  code.split("\n").forEach((line, index) => {
    if (wanted.has(index + 1)) output.push(text);
    output.push(line);
  });
  return { code: output.join("\n"), lineMap: lineMapFor(targets.map((beforeLine) => ({ beforeLine, count: 1 }))) };
};

const reindent = (structure: ScriptStructure, sfc: boolean, rewrite: (line: string) => string): ScriptEdit | null => {
  const lines = structure.lines.map((line, index) => {
    const lineNumber = index + 1;
    if ((sfc && lineNumber === 1) || line.trim() === "" || structure.contentLines.has(lineNumber)) return line;
    return rewrite(line);
  });
  return { content: lines.join("\n"), insertions: [] };
};

const swapQuotes = (structure: ScriptStructure, from: "'" | '"'): ScriptEdit | null => {
  const to = from === "'" ? '"' : "'";
  const source = structure.lines.join("\n");
  let output = source;
  let changed = false;
  for (const literal of [...structure.strings].sort((a, b) => b.start - a.start)) {
    const body = literal.raw.slice(1, -1);
    if (!literal.raw.startsWith(from) || !literal.raw.endsWith(from) || literal.raw.length < 2) continue;
    // Only literals whose body has no quotes, backslashes or line breaks can switch quotes verbatim.
    if (/['"`\\\n\r]/.test(body)) continue;
    output = output.slice(0, literal.start) + to + body + to + output.slice(literal.end);
    changed = true;
  }
  return changed ? { content: output, insertions: [] } : null;
};

export const TRANSFORMS: readonly Transform[] = [
  {
    id: "blank-lines",
    description: "a blank line before every statement (and between SFC blocks)",
    apply: (code, filename) =>
      runSteps(code, [
        (current) => insertBeforeBlocks(current, filename, ""),
        (current) => editScripts(current, filename, (structure, sfc) => insertLinesBefore(structure, sfc, () => "")),
      ]),
  },
  {
    id: "comments",
    description: "a comment line before every statement (and between SFC blocks)",
    apply: (code, filename) =>
      runSteps(code, [
        (current) => insertBeforeBlocks(current, filename, "<!-- fuzz -->"),
        (current) =>
          editScripts(current, filename, (structure, sfc) =>
            insertLinesBefore(structure, sfc, (indent) => `${indent}// fuzz comment`),
          ),
      ]),
  },
  {
    id: "indent-spaces",
    description: "four extra spaces of indentation on every line outside multi-line tokens",
    apply: (code, filename) => editScripts(code, filename, (structure, sfc) => reindent(structure, sfc, (line) => `    ${line}`)),
  },
  {
    id: "indent-tabs",
    description: "a tab of extra indentation on every line outside multi-line tokens",
    apply: (code, filename) => editScripts(code, filename, (structure, sfc) => reindent(structure, sfc, (line) => `\t${line}`)),
  },
  {
    id: "indent-flatten",
    description: "all leading whitespace removed from lines outside multi-line tokens",
    apply: (code, filename) =>
      editScripts(code, filename, (structure, sfc) => reindent(structure, sfc, (line) => line.replace(/^[ \t]+/, ""))),
  },
  {
    id: "quotes-double",
    description: "single-quoted string literals rewritten with double quotes where that is verbatim",
    apply: (code, filename) => editScripts(code, filename, (structure) => swapQuotes(structure, "'")),
  },
  {
    id: "quotes-single",
    description: "double-quoted string literals rewritten with single quotes where that is verbatim",
    apply: (code, filename) => editScripts(code, filename, (structure) => swapQuotes(structure, '"')),
  },
  {
    id: "crlf",
    description: "CRLF line endings",
    apply: (code) => (code.includes("\n") && !code.includes("\r") ? { code: code.replace(/\n/g, "\r\n"), lineMap: IDENTITY } : null),
  },
  {
    id: "bom",
    description: "a UTF-8 byte order mark at the start of the file",
    apply: (code) => (code.startsWith("﻿") ? null : { code: `﻿${code}`, lineMap: IDENTITY }),
  },
  {
    id: "eof-blank-lines",
    description: "blank lines at the end of the file",
    apply: (code) => ({ code: `${code.replace(/\n*$/, "")}\n\n\n`, lineMap: IDENTITY }),
  },
  {
    id: "lang-ts",
    description: 'lang="ts" added to every <script> of a single-file component that has no lang',
    apply: (code, filename) => {
      if (!isSfc(filename)) return null;
      const updated = code.replace(/<script\b([^>]*)>/g, (tag, attributes: string) =>
        /\blang\s*=/.test(attributes) ? tag : `<script${attributes} lang="ts">`,
      );
      return updated === code ? null : { code: updated, lineMap: IDENTITY };
    },
  },
];

/** Applies two transforms in sequence; `null` when either does not apply. */
export const composeTransforms = (first: Transform, second: Transform): Transform => ({
  id: `${first.id}+${second.id}`,
  description: `${first.description}, then ${second.description}`,
  apply: (code, filename) => {
    const firstResult = first.apply(code, filename);
    const secondResult = firstResult ? second.apply(firstResult.code, filename) : null;
    if (!firstResult || !secondResult) return null;
    return { code: secondResult.code, lineMap: (line) => secondResult.lineMap(firstResult.lineMap(line)) };
  },
});

// Rewrites of project files for the filesystem rules (they read raw file content).

export interface TreeTransformResult {
  tree: TreeInput;
  /** Whether line numbers of findings may differ (a reformatted JSON file has other line numbers). */
  linesStable: boolean;
}

export interface TreeTransform {
  id: string;
  description: string;
  apply: (tree: TreeInput) => TreeTransformResult | null;
}

const mapFiles = (tree: TreeInput, rewrite: (path: string, content: string) => string, linesStable: boolean): TreeTransformResult | null => {
  let changed = false;
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(tree.files)) {
    const next = rewrite(path, content);
    if (next !== content) changed = true;
    files[path] = next;
  }
  return changed ? { tree: { ...tree, files }, linesStable } : null;
};

export const TREE_TRANSFORMS: readonly TreeTransform[] = [
  {
    id: "crlf",
    description: "CRLF line endings in every file",
    apply: (tree) => mapFiles(tree, (_path, content) => (content.includes("\r") ? content : content.replace(/\n/g, "\r\n")), true),
  },
  {
    id: "bom",
    description: "a UTF-8 byte order mark at the start of every file",
    apply: (tree) => mapFiles(tree, (_path, content) => (content.startsWith("﻿") ? content : `﻿${content}`), true),
  },
  {
    id: "eof-blank-lines",
    description: "blank lines at the end of every file",
    apply: (tree) => mapFiles(tree, (_path, content) => `${content.replace(/\n*$/, "")}\n\n\n`, true),
  },
  {
    id: "json-reindent",
    description: "every valid JSON file re-serialized with four-space indentation",
    apply: (tree) =>
      mapFiles(
        tree,
        (path, content) => {
          if (!path.endsWith(".json")) return content;
          try {
            return `${JSON.stringify(JSON.parse(content), null, 4)}\n`;
          } catch {
            return content;
          }
        },
        false,
      ),
  },
];
