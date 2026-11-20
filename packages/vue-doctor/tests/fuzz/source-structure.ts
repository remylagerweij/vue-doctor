import { loadTypescriptParser } from "../../src/utils/load-typescript-parser.js";

// Just enough structure of a script to rewrite it without changing what it means: where a whole
// line may be inserted before a statement, which lines start inside a multi-line token (template
// literals, JSX text) and must keep their indentation, and where the plain string literals are.

interface Position {
  line: number;
  column: number;
}

interface AstToken {
  type: string;
  value: string;
  range: [number, number];
  loc: { start: Position; end: Position };
}

interface AstComment {
  type: string;
  range: [number, number];
  loc: { start: Position; end: Position };
}

interface AstNode {
  type: string;
  loc: { start: Position; end: Position };
  [key: string]: unknown;
}

interface ParsedProgram {
  body: AstNode[];
  tokens: AstToken[];
  comments: AstComment[];
}

export interface StringLiteralToken {
  start: number;
  end: number;
  /** Source text including the quotes. */
  raw: string;
}

export interface ScriptStructure {
  /** Source lines, split on `\n` (the structure is only built for LF text). */
  lines: string[];
  /**
   * 1-based lines before which a whole line may be inserted without touching a statement or
   * detaching a leading comment from it, in ascending order.
   */
  insertionLines: number[];
  /** 1-based lines whose start lies inside a multi-line token: their leading whitespace is content. */
  contentLines: ReadonlySet<number>;
  strings: StringLiteralToken[];
}

let parserModule: ReturnType<typeof loadTypescriptParser> | undefined;

const parseProgram = (source: string): ParsedProgram | null => {
  parserModule ??= loadTypescriptParser();
  for (const jsx of [false, true]) {
    try {
      return parserModule.parse(source, {
        range: true,
        loc: true,
        tokens: true,
        comment: true,
        jsx,
      } as never) as unknown as ParsedProgram;
    } catch {
      // Try the next dialect.
    }
  }
  return null;
};

/** Node types whose child lists are statement lists. */
const STATEMENT_LIST_PARENTS = new Set(["Program", "BlockStatement", "StaticBlock", "SwitchCase", "TSModuleBlock"]);

const collectStatements = (node: unknown, statements: AstNode[], seen: Set<unknown>): void => {
  if (typeof node !== "object" || node === null || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const child of node) collectStatements(child, statements, seen);
    return;
  }
  const astNode = node as AstNode;
  if (typeof astNode.type !== "string") return;
  if (STATEMENT_LIST_PARENTS.has(astNode.type)) {
    const list = (astNode.type === "SwitchCase" ? astNode.consequent : astNode.body) as unknown;
    if (Array.isArray(list)) statements.push(...(list as AstNode[]));
  }
  for (const [key, value] of Object.entries(astNode)) {
    if (key === "parent" || key === "loc" || key === "range" || key === "tokens" || key === "comments") continue;
    collectStatements(value, statements, seen);
  }
};

/** Builds the structure of `source`, or `null` when it does not parse or contains a carriage return. */
export const analyzeScript = (source: string): ScriptStructure | null => {
  if (source.includes("\r")) return null;
  const program = parseProgram(source);
  if (!program) return null;
  const lines = source.split("\n");

  const contentLines = new Set<number>();
  for (const token of program.tokens) {
    for (let line = token.loc.start.line + 1; line <= token.loc.end.line; line++) contentLines.add(line);
  }

  const commentOnlyBlockEndingAt = new Map<number, AstComment>();
  for (const comment of program.comments) {
    const startLine = lines[comment.loc.start.line - 1] ?? "";
    if (startLine.slice(0, comment.loc.start.column).trim() !== "") continue;
    const endLine = lines[comment.loc.end.line - 1] ?? "";
    if (endLine.slice(comment.loc.end.column).trim() !== "") continue;
    commentOnlyBlockEndingAt.set(comment.loc.end.line, comment);
  }

  const statements: AstNode[] = [];
  collectStatements(program, statements, new Set());
  const insertion = new Set<number>();
  for (const statement of statements) {
    let line = statement.loc.start.line;
    const prefix = (lines[line - 1] ?? "").slice(0, statement.loc.start.column);
    if (prefix.trim() !== "" || contentLines.has(line)) continue;
    // Keep leading comments attached: insert above the comment block directly over the statement.
    for (let above = commentOnlyBlockEndingAt.get(line - 1); above; above = commentOnlyBlockEndingAt.get(line - 1)) {
      line = above.loc.start.line;
    }
    // A hashbang must stay on the first line.
    if (line === 1 && source.startsWith("#!")) continue;
    if (!contentLines.has(line)) insertion.add(line);
  }

  const strings: StringLiteralToken[] = program.tokens
    .filter((token) => token.type === "String")
    .map((token) => ({ start: token.range[0], end: token.range[1], raw: token.value }));

  return { lines, insertionLines: [...insertion].sort((a, b) => a - b), contentLines, strings };
};

export interface ScriptBlock {
  /** Offset of the first character of the content (just after the opening tag). */
  start: number;
  end: number;
  /** 1-based line of the file that holds the first character of the content (the tag's line). */
  firstLine: number;
  content: string;
}

const SCRIPT_BLOCK_PATTERN = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g;

/** The `<script>` blocks of a single-file component, in source order. */
export const findScriptBlocks = (sfc: string): ScriptBlock[] => {
  const blocks: ScriptBlock[] = [];
  for (const match of sfc.matchAll(SCRIPT_BLOCK_PATTERN)) {
    const start = match.index + match[1].length;
    const firstLine = sfc.slice(0, start).split("\n").length;
    blocks.push({ start, end: start + match[2].length, firstLine, content: match[2] });
  }
  return blocks;
};

const TEMPLATE_OR_BLOCK_TAG = /<(\/?)(template|script|style)\b[^>]*?(\/?)>/g;

/**
 * 1-based lines on which a top-level SFC block (`<script>`, `<template>`, `<style>`) opens at the
 * start of the line, excluding the first line. Nested `<template v-if>` elements are not blocks.
 */
export const findTopLevelBlockLines = (sfc: string): number[] => {
  const lines: number[] = [];
  let templateDepth = 0;
  let rawBlockEnd: string | undefined;
  for (const match of sfc.matchAll(TEMPLATE_OR_BLOCK_TAG)) {
    const [, closing, name, selfClosing] = match;
    if (rawBlockEnd) {
      if (closing && name === rawBlockEnd) rawBlockEnd = undefined;
      continue;
    }
    if (closing) {
      if (name === "template" && templateDepth > 0) templateDepth--;
      continue;
    }
    const atLineStart = match.index === 0 || sfc[match.index - 1] === "\n";
    if (templateDepth === 0 && atLineStart && match.index > 0) lines.push(sfc.slice(0, match.index).split("\n").length);
    if (selfClosing) continue;
    if (name === "template") templateDepth++;
    else if (templateDepth === 0) rawBlockEnd = name;
  }
  return lines;
};
