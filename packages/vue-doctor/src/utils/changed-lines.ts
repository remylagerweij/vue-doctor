/** An inclusive range of 1-based line numbers on the new side of a diff. */
export interface ChangedLineRange {
  start: number;
  end: number;
}

/**
 * Changed lines per file (paths relative to the project directory, forward slashes): `"all"` for
 * a file that is new (added or untracked), otherwise the added or modified line ranges, which are
 * empty for a pure rename or a mode change. A file that is not a key has no changed lines.
 */
export type ChangedLines = Record<string, "all" | ChangedLineRange[]>;

// `@@ -<old>[,<count>] +<new>[,<count>] @@`; a count is omitted when it is 1.
const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const C_ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/** Undoes git's C-style quoting of a path (`"a\tb\303\251"`), decoding octal escapes as UTF-8. */
export const unquoteGitPath = (quoted: string): string => {
  if (!quoted.startsWith('"') || !quoted.endsWith('"') || quoted.length < 2) return quoted;
  const body = quoted.slice(1, -1);
  const bytes: number[] = [];
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (character !== "\\") {
      bytes.push(...Buffer.from(character, "utf-8"));
      continue;
    }
    const next = body[index + 1] ?? "";
    const octal = /^[0-7]{3}/.exec(body.slice(index + 1));
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8));
      index += 3;
    } else if (next in C_ESCAPES) {
      bytes.push(C_ESCAPES[next]);
      index += 1;
    } else {
      bytes.push(92);
    }
  }
  return Buffer.from(bytes).toString("utf-8");
};

/** Path of a `+++ ` header line, without the `b/` prefix; `null` for a deleted file (`/dev/null`). */
const parseNewPath = (header: string): string | null => {
  let raw = header.slice("+++ ".length);
  // Git appends a tab after a path containing a space; a path that itself ends in a tab is quoted.
  if (!raw.startsWith('"') && raw.endsWith("\t")) raw = raw.slice(0, -1);
  if (raw === "/dev/null") return null;
  const unquoted = unquoteGitPath(raw);
  return unquoted.startsWith("b/") ? unquoted.slice(2) : unquoted;
};

/**
 * Parses `git diff --unified=0 --src-prefix=a/ --dst-prefix=b/` output into the changed lines on
 * the new side. Hunk bodies are skipped by their line counts, so content that looks like a header
 * (an added line `++ x` shows as `+++ x`) is never taken for one. Deleted files, binary files and
 * pure deletions contribute nothing; new files are `"all"`.
 */
export const parseUnifiedDiff = (diffOutput: string): ChangedLines => {
  const changed: ChangedLines = {};
  let currentPath: string | null = null;
  let isNewFile = false;
  let remainingOld = 0;
  let remainingNew = 0;

  for (const line of diffOutput.split("\n")) {
    if (remainingOld > 0 || remainingNew > 0) {
      const marker = line[0];
      if (marker === "\\") continue; // "\ No newline at end of file"
      if (marker === "-" && remainingOld > 0) {
        remainingOld--;
        continue;
      }
      if (marker === "+" && remainingNew > 0) {
        remainingNew--;
        continue;
      }
      if (marker === " " && remainingOld > 0 && remainingNew > 0) {
        remainingOld--;
        remainingNew--;
        continue;
      }
      // Not a body line after all (malformed counts): read it as a header.
      remainingOld = 0;
      remainingNew = 0;
    }

    if (line.startsWith("diff --git ")) {
      currentPath = null;
      isNewFile = false;
    } else if (line.startsWith("new file mode ")) {
      isNewFile = true;
    } else if (line.startsWith("+++ ")) {
      currentPath = parseNewPath(line);
      if (currentPath !== null) changed[currentPath] = isNewFile ? "all" : (changed[currentPath] ?? []);
    } else if (line.startsWith("@@ ")) {
      const match = HUNK_HEADER.exec(line);
      if (!match) continue;
      remainingOld = match[1] === undefined ? 1 : Number(match[1]);
      const start = Number(match[2]);
      const count = match[3] === undefined ? 1 : Number(match[3]);
      remainingNew = count;
      const ranges = currentPath === null ? undefined : changed[currentPath];
      if (count > 0 && Array.isArray(ranges)) ranges.push({ start, end: start + count - 1 });
    }
    // Anything else ("index", "rename from", "Binary files ... differ", "\ No newline ...") carries no lines.
  }
  return changed;
};

/** Whether `line` of `filePath` is a changed line; files that are not keys have none. */
export const isChangedLine = (changedLines: ChangedLines, filePath: string, line: number): boolean => {
  const ranges = changedLines[filePath];
  if (ranges === undefined) return false;
  if (ranges === "all") return true;
  return ranges.some((range) => line >= range.start && line <= range.end);
};
