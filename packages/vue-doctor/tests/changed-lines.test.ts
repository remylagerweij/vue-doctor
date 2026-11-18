import { describe, expect, it } from "vitest";
import { keepChangedLineFindings } from "../src/core/diff-lines.js";
import type { Diagnostic } from "../src/types.js";
import { isChangedLine, parseUnifiedDiff, unquoteGitPath } from "../src/utils/changed-lines.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

describe("parseUnifiedDiff", () => {
  it("collects added and modified ranges on the new side", () => {
    const parsed = parseUnifiedDiff(
      lines(
        "diff --git a/src/a.ts b/src/a.ts",
        "index 1111111..2222222 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -2,2 +2,3 @@ export const x = 1;",
        "-old two",
        "-old three",
        "+new two",
        "+new three",
        "+new four",
        "@@ -10,0 +12,2 @@",
        "+inserted",
        "+inserted",
      ),
    );
    expect(parsed).toEqual({ "src/a.ts": [{ start: 2, end: 4 }, { start: 12, end: 13 }] });
  });

  it("reads single-line hunks without a count", () => {
    const parsed = parseUnifiedDiff(
      lines("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -5 +5 @@", "-before", "+after", "@@ -9,0 +10 @@", "+added"),
    );
    expect(parsed).toEqual({ "a.ts": [{ start: 5, end: 5 }, { start: 10, end: 10 }] });
  });

  it("records nothing for pure deletions", () => {
    const parsed = parseUnifiedDiff(lines("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -3,2 +2,0 @@", "-gone", "-gone"));
    expect(parsed).toEqual({ "a.ts": [] });
  });

  it("ignores '\\ No newline at end of file' markers inside and after hunks", () => {
    const parsed = parseUnifiedDiff(
      lines(
        "diff --git a/a.ts b/a.ts",
        "--- a/a.ts",
        "+++ b/a.ts",
        "@@ -3 +3,2 @@",
        "-last",
        "\\ No newline at end of file",
        "+last",
        "+more",
        "\\ No newline at end of file",
        "@@ -8 +9 @@",
        "-x",
        "+y",
      ),
    );
    expect(parsed).toEqual({ "a.ts": [{ start: 3, end: 4 }, { start: 9, end: 9 }] });
  });

  it("never mistakes hunk content for a header", () => {
    const parsed = parseUnifiedDiff(
      lines(
        "diff --git a/a.ts b/a.ts",
        "--- a/a.ts",
        "+++ b/a.ts",
        "@@ -0,0 +1,3 @@",
        "+++ b/fake.ts",
        "+@@ -1 +100,5 @@",
        "+diff --git a/x b/x",
      ),
    );
    expect(parsed).toEqual({ "a.ts": [{ start: 1, end: 3 }] });
  });

  it("marks new files as fully changed and skips deleted and binary files", () => {
    const parsed = parseUnifiedDiff(
      lines(
        "diff --git a/new.ts b/new.ts",
        "new file mode 100644",
        "index 0000000..1111111",
        "--- /dev/null",
        "+++ b/new.ts",
        "@@ -0,0 +1,2 @@",
        "+a",
        "+b",
        "diff --git a/old.ts b/old.ts",
        "deleted file mode 100644",
        "--- a/old.ts",
        "+++ /dev/null",
        "@@ -1,2 +0,0 @@",
        "-a",
        "-b",
        "diff --git a/logo.png b/logo.png",
        "index 1111111..2222222 100644",
        "Binary files a/logo.png and b/logo.png differ",
      ),
    );
    expect(parsed).toEqual({ "new.ts": "all" });
  });

  it("follows a rename to the new path", () => {
    const parsed = parseUnifiedDiff(
      lines(
        "diff --git a/old/name.ts b/new/name.ts",
        "similarity index 90%",
        "rename from old/name.ts",
        "rename to new/name.ts",
        "index 1111111..2222222 100644",
        "--- a/old/name.ts",
        "+++ b/new/name.ts",
        "@@ -4 +4 @@",
        "-a",
        "+b",
      ),
    );
    expect(parsed).toEqual({ "new/name.ts": [{ start: 4, end: 4 }] });
  });

  it("reads quoted paths and paths with a trailing tab", () => {
    const parsed = parseUnifiedDiff(
      lines(
        "diff --git a/my file.ts b/my file.ts",
        "--- a/my file.ts\t",
        "+++ b/my file.ts\t",
        "@@ -1 +1 @@",
        "-a",
        "+b",
        'diff --git "a/caf\\303\\251\\t.ts" "b/caf\\303\\251\\t.ts"',
        '--- "a/caf\\303\\251\\t.ts"',
        '+++ "b/caf\\303\\251\\t.ts"',
        "@@ -2 +2 @@",
        "-a",
        "+b",
      ),
    );
    expect(parsed).toEqual({ "my file.ts": [{ start: 1, end: 1 }], "café\t.ts": [{ start: 2, end: 2 }] });
  });

  it("handles CRLF content and an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual({});
    const parsed = parseUnifiedDiff(lines("diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -1 +1 @@", "-a\r", "+b\r"));
    expect(parsed).toEqual({ "a.ts": [{ start: 1, end: 1 }] });
  });
});

describe("unquoteGitPath / isChangedLine", () => {
  it("leaves unquoted paths alone and decodes escapes", () => {
    expect(unquoteGitPath("src/a.ts")).toBe("src/a.ts");
    expect(unquoteGitPath('"a\\"b\\\\c"')).toBe('a"b\\c');
  });

  it("checks ranges inclusively", () => {
    const changed = { "a.ts": [{ start: 3, end: 5 }], "b.ts": "all" as const };
    expect([2, 3, 5, 6].map((line) => isChangedLine(changed, "a.ts", line))).toEqual([false, true, true, false]);
    expect(isChangedLine(changed, "b.ts", 999)).toBe(true);
    expect(isChangedLine(changed, "c.ts", 1)).toBe(false);
  });
});

describe("keepChangedLineFindings", () => {
  const finding = (overrides: Partial<Diagnostic>): Diagnostic => ({
    filePath: "src/a.ts",
    plugin: "vue-doctor",
    rule: "security/no-eval",
    severity: "error",
    message: "m",
    help: "h",
    line: 1,
    column: 1,
    category: "Security",
    ...overrides,
  });

  it("keeps line findings on changed lines only", () => {
    const kept = keepChangedLineFindings(
      [finding({ line: 2 }), finding({ line: 4 }), finding({ filePath: "src/other.ts", line: 4 })],
      { "src/a.ts": [{ start: 4, end: 4 }] },
    );
    expect(kept.map((diagnostic) => `${diagnostic.filePath}:${diagnostic.line}`)).toEqual(["src/a.ts:4"]);
  });

  it("keeps file-level findings (filesystem rules, knip, no line) of changed files", () => {
    const fileLevel = [
      finding({ filePath: ".env.local", rule: "security/no-committed-env", line: 1 }),
      finding({ plugin: "knip", rule: "exports", line: 7 }),
      finding({ line: 0 }),
    ];
    const kept = keepChangedLineFindings(fileLevel, { ".env.local": [], "src/a.ts": [{ start: 2, end: 2 }] });
    expect(kept).toHaveLength(3);
    expect(keepChangedLineFindings(fileLevel, {})).toHaveLength(0);
  });
});
