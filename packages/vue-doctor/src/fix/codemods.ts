/**
 * Deterministic codemods for `--fix`, one per rule, keyed by canonical rule ID.
 *
 * A codemod never scans a file on its own initiative: it receives the locations the analyzers
 * reported for its rule in that file and rewrites only the matches that contain one of them. Code
 * that was not reported (suppressed, disabled in the config, outside `--diff`, or simply a pattern
 * the rule does not flag) is left alone. Every codemod is idempotent: a fixed match no longer
 * matches, so a second run with the same (now stale) locations changes nothing.
 */

/** Where a finding was reported: 1-based line and 1-based column in UTF-16 code units (0: unknown). */
export interface FixLocation {
  line: number;
  column: number;
}

export interface CodemodResult {
  code: string;
  /** Number of reported matches this codemod rewrote. */
  fixed: number;
}

export interface Codemod {
  /** Canonical rule ID (`ruleIdOf`) whose findings this codemod fixes. */
  ruleId: string;
  /**
   * Unit of the column the rule's analyzer reports: oxlint counts UTF-8 bytes, ESLint (the template
   * pass) UTF-16 code units. The runner converts to UTF-16 before calling `apply`.
   */
  columnUnit: "utf8" | "utf16";
  /** One-line description for docs and `--fix` output. */
  description: string;
  /** Whether the codemod can run on this (project-relative) file. */
  appliesTo: (filePath: string) => boolean;
  apply: (source: string, locations: readonly FixLocation[]) => CodemodResult;
}

/** A pattern match in the source; `replacement: null` marks a match the codemod declines to rewrite. */
interface Candidate {
  start: number;
  end: number;
  replacement: string | null;
}

const SCRIPT_FILE_PATTERN = /\.(?:vue|[cm]?[jt]sx?)$/i;

const computeLineStarts = (source: string): number[] => {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
};

const lineOfOffset = (lineStarts: readonly number[], offset: number): number => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lineStarts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
};

/**
 * Picks the candidates that correspond to reported findings. With a column, the candidate must
 * contain the reported position; without one (column 0), the line must contain exactly one
 * candidate, so an ambiguous line is left alone rather than guessed.
 */
const selectReported = (
  source: string,
  candidates: readonly Candidate[],
  locations: readonly FixLocation[],
): Set<Candidate> => {
  const selected = new Set<Candidate>();
  if (candidates.length === 0 || locations.length === 0) return selected;
  const lineStarts = computeLineStarts(source);
  for (const { line, column } of locations) {
    if (!Number.isInteger(line) || line < 1 || line > lineStarts.length) continue;
    if (column > 0) {
      const lineEnd = line < lineStarts.length ? lineStarts[line] : source.length;
      const offset = lineStarts[line - 1] + column - 1;
      if (offset >= lineEnd + 1) continue;
      const containing = candidates.filter((candidate) => candidate.start <= offset && offset < candidate.end);
      // Overlapping candidates are not expected; take the innermost one if they ever occur.
      const innermost = containing.sort((a, b) => a.end - a.start - (b.end - b.start))[0];
      if (innermost) selected.add(innermost);
      continue;
    }
    const onLine = candidates.filter(
      (candidate) =>
        lineOfOffset(lineStarts, candidate.start) <= line && line <= lineOfOffset(lineStarts, Math.max(candidate.start, candidate.end - 1)),
    );
    if (onLine.length === 1) selected.add(onLine[0]);
  }
  return selected;
};

/** Rewrites the reported, non-declined candidates (back to front, so offsets stay valid). */
const applyCandidates = (
  source: string,
  candidates: readonly Candidate[],
  locations: readonly FixLocation[],
): CodemodResult => {
  const selected = [...selectReported(source, candidates, locations)]
    .filter((candidate) => candidate.replacement !== null)
    .sort((a, b) => b.start - a.start);
  let code = source;
  let previousStart = Number.POSITIVE_INFINITY;
  let fixed = 0;
  for (const candidate of selected) {
    // Never apply overlapping edits.
    if (candidate.end > previousStart) continue;
    code = code.slice(0, candidate.start) + candidate.replacement + code.slice(candidate.end);
    previousStart = candidate.start;
    fixed++;
  }
  return { code, fixed };
};

const lineIndentation = (source: string, offset: number): string => {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart, offset))?.[0] ?? "";
};

const endOfLine = (source: string): string => (source.includes("\r\n") ? "\r\n" : "\n");

// ---------------------------------------------------------------------------------------------
// vue-doctor/bundle-size/no-full-lodash-import
// ---------------------------------------------------------------------------------------------

/**
 * `import <clause> from "lodash"` where the clause consists of identifiers, braces, commas, `*`
 * and whitespace only (no comments or strings) and never contains another `import`, so a match
 * cannot start in a comment and run into a later statement.
 */
const LODASH_IMPORT_PATTERN = /\bimport\b((?:(?!\bimport\b)[\w$\s,*{}])*?)\bfrom\s*(["'])lodash\2(?:[ \t]*;)?/g;
const LODASH_SPECIFIER_PATTERN = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;
/** lodash's per-method modules are its lower camelCase function names. */
const LODASH_METHOD_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;
/** Methods whose per-method module behaves differently from the full build (wrapper and context helpers). */
const LODASH_UNSAFE_METHODS = new Set(["chain", "mixin", "runInContext", "noConflict", "default"]);

const rewriteLodashImport = (source: string, start: number, clause: string, quote: string, hasSemicolon: boolean): string | null => {
  // Only `{ a, b as c }`: default and namespace imports use the whole library on purpose.
  const named = /^\{([^{}]*)\}$/.exec(clause.trim());
  if (!named) return null;
  const specifiers = named[1]
    .split(",")
    .map((specifier) => specifier.trim())
    .filter(Boolean);
  if (specifiers.length === 0) return null;
  const imports: string[] = [];
  for (const specifier of specifiers) {
    // `type X` inline type specifiers (and anything else unusual) leave the import as it is.
    const match = LODASH_SPECIFIER_PATTERN.exec(specifier);
    if (!match) return null;
    const [, imported, local = imported] = match;
    if (!LODASH_METHOD_NAME_PATTERN.test(imported) || LODASH_UNSAFE_METHODS.has(imported)) return null;
    imports.push(`import ${local} from ${quote}lodash/${imported}.js${quote}${hasSemicolon ? ";" : ""}`);
  }
  return imports.join(endOfLine(source) + lineIndentation(source, start));
};

export const fixFullLodashImport = (source: string, locations: readonly FixLocation[]): CodemodResult => {
  const candidates: Candidate[] = [];
  for (const match of source.matchAll(LODASH_IMPORT_PATTERN)) {
    const start = match.index;
    const [text, clause, quote] = match;
    candidates.push({
      start,
      end: start + text.length,
      replacement: rewriteLodashImport(source, start, clause, quote, text.trimEnd().endsWith(";")),
    });
  }
  return applyCandidates(source, candidates, locations);
};

// ---------------------------------------------------------------------------------------------
// vue-doctor/performance/js-tosorted-immutable
// ---------------------------------------------------------------------------------------------

const SPREAD_SORT_PATTERN = /\[\s*\.\.\.\s*([^\]]*?)\s*\]\s*\.\s*sort\s*\(/g;
/**
 * An identifier or a plain member chain (`items`, `this.items`, `state.list.value`). No calls,
 * operators, computed members or optional chaining: `[...a?.b].sort()` throws where
 * `a?.b.toSorted()` would return undefined, and anything with operators could change precedence.
 */
const SIMPLE_RECEIVER_PATTERN = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*$/;

export const fixToSortedImmutable = (source: string, locations: readonly FixLocation[]): CodemodResult => {
  const candidates: Candidate[] = [];
  for (const match of source.matchAll(SPREAD_SORT_PATTERN)) {
    const start = match.index;
    const [text, receiver] = match;
    candidates.push({
      start,
      end: start + text.length,
      replacement: SIMPLE_RECEIVER_PATTERN.test(receiver) ? `${receiver}.toSorted(` : null,
    });
  }
  return applyCandidates(source, candidates, locations);
};

// ---------------------------------------------------------------------------------------------
// vue/no-template-target-blank
// ---------------------------------------------------------------------------------------------

interface Attribute {
  name: string;
  start: number;
  end: number;
  value: string | undefined;
  quote: string;
}

interface StartTag {
  start: number;
  end: number;
  attributes: Attribute[];
}

const isSpace = (character: string | undefined): boolean => character !== undefined && /\s/.test(character);

/**
 * Parses the start tag that begins at `start` (`<a ...>` or `<a ... />`): attribute values may be
 * quoted (and then contain `>`), unquoted or absent. Returns null for an unterminated tag.
 */
const parseStartTag = (source: string, start: number, nameLength: number): StartTag | null => {
  const attributes: Attribute[] = [];
  let index = start + 1 + nameLength;
  while (index < source.length) {
    while (isSpace(source[index])) index++;
    const character = source[index];
    if (character === undefined) return null;
    if (character === ">") return { start, end: index + 1, attributes };
    if (character === "/" && source[index + 1] === ">") return { start, end: index + 2, attributes };
    if (character === "/") {
      index++;
      continue;
    }
    const nameStart = index;
    while (index < source.length && !isSpace(source[index]) && !"\"'>=".includes(source[index]) && !(source[index] === "/" && source[index + 1] === ">")) {
      index++;
    }
    const name = source.slice(nameStart, index);
    if (name === "") return null;
    let lookahead = index;
    while (isSpace(source[lookahead])) lookahead++;
    if (source[lookahead] !== "=") {
      attributes.push({ name, start: nameStart, end: index, value: undefined, quote: "" });
      continue;
    }
    index = lookahead + 1;
    while (isSpace(source[index])) index++;
    const quote = source[index];
    if (quote === '"' || quote === "'") {
      const close = source.indexOf(quote, index + 1);
      if (close === -1) return null;
      attributes.push({ name, start: nameStart, end: close + 1, value: source.slice(index + 1, close), quote });
      index = close + 1;
    } else {
      const valueStart = index;
      while (index < source.length && !isSpace(source[index]) && source[index] !== ">") index++;
      attributes.push({ name, start: nameStart, end: index, value: source.slice(valueStart, index), quote: "" });
    }
  }
  return null;
};

const ANCHOR_START_PATTERN = /<a(?=[\s/>])/g;
/** A `rel` bound at runtime (`:rel`, `v-bind:rel`, `.rel`, dynamic arguments, `v-bind="obj"`): the fixer cannot know its value. */
const DYNAMIC_REL_PATTERN = /^(?:(?::|v-bind:|\.)(?:rel(?:\.|$)|\[)|v-bind$)/i;
const REQUIRED_REL_TOKENS = ["noopener", "noreferrer"] as const;

const rewriteAnchorTag = (source: string, tag: StartTag): string | null => {
  const { attributes } = tag;
  if (attributes.some((attribute) => DYNAMIC_REL_PATTERN.test(attribute.name))) return null;
  const targets = attributes.filter((attribute) => attribute.name.toLowerCase() === "target");
  if (targets.length !== 1 || targets[0].value !== "_blank") return null;
  const rels = attributes.filter((attribute) => attribute.name.toLowerCase() === "rel");
  if (rels.length > 1) return null;

  const tagText = source.slice(tag.start, tag.end);
  const relative = (offset: number): number => offset - tag.start;
  if (rels.length === 0) {
    const insertAt = relative(targets[0].end);
    return `${tagText.slice(0, insertAt)} rel="noopener noreferrer"${tagText.slice(insertAt)}`;
  }

  const [rel] = rels;
  const value = rel.value ?? "";
  // Same tokenisation as eslint-plugin-vue: lower-cased and split on single spaces.
  const tokens = value.toLowerCase().split(" ");
  const missing = REQUIRED_REL_TOKENS.filter((token) => !tokens.includes(token));
  if (missing.length === 0) return null;
  const quote = rel.quote || '"';
  const newValue = [value.trimEnd(), ...missing].filter(Boolean).join(" ");
  return `${tagText.slice(0, relative(rel.start))}${rel.name}=${quote}${newValue}${quote}${tagText.slice(relative(rel.end))}`;
};

export const fixTemplateTargetBlank = (source: string, locations: readonly FixLocation[]): CodemodResult => {
  const candidates: Candidate[] = [];
  for (const match of source.matchAll(ANCHOR_START_PATTERN)) {
    const tag = parseStartTag(source, match.index, 1);
    if (!tag) continue;
    candidates.push({ start: tag.start, end: tag.end, replacement: rewriteAnchorTag(source, tag) });
  }
  return applyCandidates(source, candidates, locations);
};

// ---------------------------------------------------------------------------------------------
// Registry of codemods
// ---------------------------------------------------------------------------------------------

/**
 * Every codemod by canonical rule ID. A rule is `fixable: true` in the registry exactly when it is
 * listed here (enforced by tests/fix-codemods.test.ts).
 *
 * `vue/require-v-for-key` deliberately has none: a correct key is a unique, stable identity from
 * the data, which a codemod cannot know. `item.id` is a guess about the data's shape, and the
 * index (the only always-available value) silences the rule without changing how Vue patches the list.
 */
export const CODEMODS: ReadonlyMap<string, Codemod> = new Map(
  (
    [
      {
        ruleId: "vue-doctor/bundle-size/no-full-lodash-import",
        columnUnit: "utf8",
        description: 'Rewrites `import { debounce } from "lodash"` to per-method imports (`lodash/debounce.js`)',
        appliesTo: (filePath) => SCRIPT_FILE_PATTERN.test(filePath),
        apply: fixFullLodashImport,
      },
      {
        ruleId: "vue-doctor/performance/js-tosorted-immutable",
        columnUnit: "utf8",
        description: "Rewrites `[...items].sort(compare)` to `items.toSorted(compare)` for a plain identifier or member chain",
        appliesTo: (filePath) => SCRIPT_FILE_PATTERN.test(filePath),
        apply: fixToSortedImmutable,
      },
      {
        ruleId: "vue/no-template-target-blank",
        columnUnit: "utf16",
        description: 'Adds or completes `rel="noopener noreferrer"` on `<a target="_blank">` links',
        appliesTo: (filePath) => /\.vue$/i.test(filePath),
        apply: fixTemplateTargetBlank,
      },
    ] satisfies Codemod[]
  ).map((codemod) => [codemod.ruleId, codemod]),
);

/** Converts an analyzer column (1-based, in `unit`) to a 1-based UTF-16 column on `lineText`. */
export const toUtf16Column = (lineText: string, column: number, unit: Codemod["columnUnit"]): number => {
  if (column <= 0 || unit === "utf16") return column;
  const targetBytes = column - 1;
  let bytes = 0;
  let index = 0;
  while (index < lineText.length && bytes < targetBytes) {
    const codePoint = lineText.codePointAt(index)!;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
    index += codePoint > 0xffff ? 2 : 1;
  }
  return index + 1;
};

export interface ApplyCodemodsResult {
  code: string;
  /** Fixed findings per canonical rule ID. */
  fixedRules: Record<string, number>;
  changed: boolean;
}

/**
 * Applies the codemods for the reported findings of one file. `findings` maps canonical rule IDs to
 * the locations as the analyzer reported them (columns in the codemod's `columnUnit`); rules
 * without a codemod are ignored. Codemods run one after another in `CODEMODS` order; their
 * patterns do not overlap, and each one is matched against the locations in the current text.
 */
export const applyCodemods = (
  source: string,
  filePath: string,
  findings: ReadonlyMap<string, readonly FixLocation[]>,
): ApplyCodemodsResult => {
  let current = source;
  const fixedRules: Record<string, number> = {};
  for (const [ruleId, codemod] of CODEMODS) {
    const reported = findings.get(ruleId);
    if (!reported || reported.length === 0 || !codemod.appliesTo(filePath)) continue;
    // The locations refer to the original text; an earlier codemod may have added lines.
    const locations = translateLocations(source, current, reported, codemod.columnUnit);
    const result = codemod.apply(current, locations);
    if (result.fixed > 0) {
      current = result.code;
      fixedRules[ruleId] = result.fixed;
    }
  }
  return { code: current, fixedRules, changed: current !== source };
};

/**
 * Maps locations reported on `original` onto `current` (the text after earlier codemods) and
 * converts their columns to UTF-16. Lines are mapped through a line diff of the two texts, so an
 * earlier edit that added or removed lines does not shift a later codemod onto the wrong line; a
 * location on a line that an earlier codemod changed is dropped.
 */
const translateLocations = (
  original: string,
  current: string,
  reported: readonly FixLocation[],
  unit: Codemod["columnUnit"],
): FixLocation[] => {
  const originalLines = original.split("\n");
  const lineMap = original === current ? null : mapUnchangedLines(originalLines, current.split("\n"));
  const locations: FixLocation[] = [];
  for (const { line, column } of reported) {
    const lineText = originalLines[line - 1];
    if (lineText === undefined) continue;
    const mappedLine = lineMap ? lineMap.get(line) : line;
    if (mappedLine === undefined) continue;
    locations.push({ line: mappedLine, column: toUtf16Column(lineText.replace(/\r$/, ""), column, unit) });
  }
  return locations;
};

/** 1-based line numbers of `a` that survive unchanged in `b`, mapped to their line in `b`. */
const mapUnchangedLines = (a: readonly string[], b: readonly string[]): Map<number, number> => {
  const map = new Map<number, number>();
  for (const [kind, aIndex, bIndex] of diffLines(a, b)) {
    if (kind === " ") map.set(aIndex + 1, bIndex + 1);
  }
  return map;
};

type DiffOperation = [kind: " " | "-" | "+", aIndex: number, bIndex: number];

/**
 * Line diff (Myers' O(ND) algorithm) as a list of operations: `" "` keeps line `aIndex` of `a`
 * (which is line `bIndex` of `b`), `"-"` removes line `aIndex`, `"+"` adds line `bIndex`.
 */
export const diffLines = (a: readonly string[], b: readonly string[]): DiffOperation[] => {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  const operations: DiffOperation[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;
    const previousK = k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
    const previousX = vd[offset + previousK];
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x--;
      y--;
      operations.push([" ", x, y]);
    }
    if (d > 0) {
      if (x === previousX) operations.push(["+", x, previousY]);
      else operations.push(["-", previousX, y]);
    }
    x = previousX;
    y = previousY;
  }
  return operations.reverse();
};

const DIFF_CONTEXT_LINES = 3;

/** A git-style unified diff (3 lines of context) between two versions of a file; "" when equal. */
export const createUnifiedDiff = (filePath: string, original: string, modified: string): string => {
  if (original === modified) return "";
  const a = original.split(/\r?\n/);
  const b = modified.split(/\r?\n/);
  const operations = diffLines(a, b);
  const output = [`--- a/${filePath}`, `+++ b/${filePath}`];
  let index = 0;
  while (index < operations.length) {
    if (operations[index][0] === " ") {
      index++;
      continue;
    }
    // Grow the hunk while changes are separated by at most 2 * context unchanged lines.
    const hunkStart = Math.max(0, index - DIFF_CONTEXT_LINES);
    let hunkEnd = index;
    let unchangedRun = 0;
    for (let cursor = index; cursor < operations.length; cursor++) {
      if (operations[cursor][0] === " ") {
        unchangedRun++;
        if (unchangedRun > 2 * DIFF_CONTEXT_LINES) break;
      } else {
        unchangedRun = 0;
        hunkEnd = cursor;
      }
    }
    const hunkStop = Math.min(operations.length, hunkEnd + 1 + DIFF_CONTEXT_LINES);
    const hunk = operations.slice(hunkStart, hunkStop);
    const aLines = hunk.filter(([kind]) => kind !== "+");
    const bLines = hunk.filter(([kind]) => kind !== "-");
    // An empty side is numbered by the line it follows (git's `-0,0` for an insertion at the top).
    const aStart = aLines.length > 0 ? aLines[0][1] + 1 : hunk[0][1];
    const bStart = bLines.length > 0 ? bLines[0][2] + 1 : hunk[0][2];
    output.push(`@@ -${aStart},${aLines.length} +${bStart},${bLines.length} @@`);
    for (const [kind, aIndex, bIndex] of hunk) output.push(`${kind}${kind === "+" ? b[bIndex] : a[aIndex]}`);
    index = hunkStop;
  }
  return output.join("\n");
};
