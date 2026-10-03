import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_CODES } from "../src/core/gate.js";
import type { Diagnostic } from "../src/types.js";
import { colorizeByScore } from "../src/utils/colorize-by-score.js";
import { combineDiagnostics, computeVueIncludePaths } from "../src/utils/combine-diagnostics.js";
import { createDefusedMirror, findFilesWithForeignDirectives } from "../src/utils/defuse-inline-directives.js";
import { createFramedLine, printFramedBox } from "../src/utils/framed-box.js";
import { groupBy } from "../src/utils/group-by.js";
import { handleError } from "../src/utils/handle-error.js";
import { highlighter } from "../src/utils/highlighter.js";
import { configureLogger, logger, output } from "../src/utils/logger.js";
import { matchGlobPattern } from "../src/utils/match-glob-pattern.js";
import { createPrivateTempDirectory } from "../src/utils/private-temp.js";
import { isSupportedNodeVersion, resolveNodeForOxlint } from "../src/utils/resolve-compatible-node.js";
import { getToolVersions } from "../src/utils/tool-versions.js";

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

const capture = (stream: "stdout" | "stderr"): string[] => {
  const chunks: string[] = [];
  vi.spyOn(process[stream], "write").mockImplementation((chunk) => {
    chunks.push(String(chunk).replace(ANSI_PATTERN, ""));
    return true;
  });
  return chunks;
};

const temporaryDirectories: string[] = [];
const makeDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-utils-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  configureLogger();
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const finding = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "src/a.vue",
  plugin: "vue-doctor",
  rule: "no-v-html",
  severity: "error",
  message: "Avoid <v-html> & friends",
  help: "Sanitize the input",
  line: 1,
  column: 1,
  category: "Security",
  ...overrides,
});

describe("groupBy", () => {
  it("groups items by key in first-seen order", () => {
    const groups = groupBy([1, 2, 3, 4, 5], (value) => (value % 2 === 0 ? "even" : "odd"));
    expect([...groups.keys()]).toEqual(["odd", "even"]);
    expect(groups.get("odd")).toEqual([1, 3, 5]);
    expect(groupBy([], () => "x").size).toBe(0);
  });
});

describe("logger", () => {
  it("writes status output to stderr and report output to stdout", () => {
    const stderr = capture("stderr");
    const stdout = capture("stdout");
    logger.log("log");
    logger.info("info");
    logger.success("success");
    logger.dim("dim");
    logger.break();
    logger.warn("warn");
    logger.error("error");
    output.line("report");
    output.break();
    expect(stderr).toEqual(["log\n", "info\n", "success\n", "dim\n", "\n", "warn\n", "error\n"]);
    expect(stdout).toEqual(["report\n", "\n"]);
  });

  it("keeps only warnings and errors in quiet mode", () => {
    configureLogger({ level: "quiet" });
    const stderr = capture("stderr");
    logger.log("log");
    logger.break();
    logger.warn("warn");
    logger.error("error");
    expect(logger.isQuiet()).toBe(true);
    expect(stderr).toEqual(["warn\n", "error\n"]);
  });

  it("prints debug lines only for enabled namespaces and honours exclusions", () => {
    const stderr = capture("stderr");
    logger.debug("config", "hidden");
    configureLogger({ debugEnv: "vue-doctor:conf*, -vue-doctor:config:noisy" });
    logger.debug("config", "shown");
    logger.debug("config:noisy", "excluded");
    logger.debug("other", "not matched");
    expect(stderr).toEqual(["vue-doctor:config shown\n"]);

    configureLogger({ level: "debug", debugEnv: "-vue-doctor:env" });
    logger.debug("anything", "all namespaces");
    logger.debug("env", "excluded even in debug mode");
    expect(stderr).toEqual(["vue-doctor:config shown\n", "vue-doctor:anything all namespaces\n"]);
  });
});

describe("handleError", () => {
  it("logs the message of an Error and exits with the usage error code", () => {
    const stderr = capture("stderr");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    handleError(new Error("kaput"));
    expect(stderr.join("")).toContain("kaput");
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.usageError);
  });

  it("stringifies values that are not errors", () => {
    const stderr = capture("stderr");
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    handleError("plain text");
    handleError({ toString: () => "custom" });
    expect(stderr.join("")).toContain("plain text");
    expect(stderr.join("")).toContain("custom");
  });
});

describe("terminal helpers", () => {
  it("colours scores by threshold", () => {
    expect(colorizeByScore("x", 100)).toContain("x");
    expect(colorizeByScore("x", 75)).toContain("x");
    expect(colorizeByScore("x", 50)).toContain("x");
    expect(colorizeByScore("x", 49)).toContain("x");
    for (const color of ["error", "warn", "info", "success", "dim"] as const) {
      expect(highlighter[color]("text")).toContain("text");
    }
  });

  it("draws a box as wide as the longest plain line, padding rendered lines by their plain width", () => {
    const stderr = capture("stderr");
    printFramedBox([createFramedLine("short", "SHORT"), createFramedLine("a longer line")]);
    const lines = stderr.join("").trimEnd().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^ {2}┌─{15}┐$/);
    expect(lines[1]).toBe("  │ SHORT         │");
    expect(lines[2]).toBe("  │ a longer line │");
    expect(lines[3]).toMatch(/^ {2}└─{15}┘$/);
  });
});

describe("matchGlobPattern", () => {
  it("matches whole paths and suffixes at directory boundaries, with * and ** wildcards", () => {
    expect(matchGlobPattern("src/a.vue", "src/*.vue")).toBe(true);
    expect(matchGlobPattern("src/deep/a.vue", "src/*.vue")).toBe(false);
    expect(matchGlobPattern("src/deep/a.vue", "src/**/*.vue")).toBe(true);
    expect(matchGlobPattern("packages/x/src/a.vue", "src/*.vue")).toBe(true);
    expect(matchGlobPattern("mysrc/a.vue", "src/*.vue")).toBe(false);
    expect(matchGlobPattern("a.b.vue", "a.b.vue")).toBe(true);
    expect(matchGlobPattern("axb.vue", "a.b.vue")).toBe(false);
  });
});

describe("combineDiagnostics", () => {
  it("merges lint and dead-code findings and applies the user config", () => {
    const lint = [finding(), finding({ rule: "no-eval", filePath: "src/b.ts" })];
    const dead = [finding({ plugin: "knip", rule: "files", category: "Dead Code", severity: "warning" })];
    expect(combineDiagnostics(lint, dead, "/p", false, null)).toHaveLength(3);
    expect(combineDiagnostics(lint, dead, "/p", false, { ignore: { files: ["src/b.ts"] } })).toHaveLength(2);
  });

  it("selects Vue-processable files for the template analyzer", () => {
    expect(computeVueIncludePaths(["a.vue", "b.ts", "c.css", "d.jsx", "e.md"])).toEqual(["a.vue", "b.ts", "d.jsx"]);
  });
});

describe("createPrivateTempDirectory", () => {
  it("creates a uniquely named directory, writes files exclusively and disposes everything", () => {
    const first = createPrivateTempDirectory("unit");
    const second = createPrivateTempDirectory("unit");
    try {
      expect(first.directory).not.toBe(second.directory);
      expect(path.basename(first.directory)).toMatch(/^vue-doctor-unit-/);

      const target = first.writeFile("nested/dir/file.txt", "content");
      expect(fs.readFileSync(target, "utf-8")).toBe("content");
      expect(() => first.writeFile("nested/dir/file.txt", "again")).toThrow();
    } finally {
      first.dispose();
      second.dispose();
    }
    expect(fs.existsSync(first.directory)).toBe(false);
    expect(() => first.dispose()).not.toThrow();
  });
});

describe("defused mirrors", () => {
  it("finds files with foreign disable directives and mirrors them with the same length", () => {
    const root = makeDirectory();
    fs.mkdirSync(path.join(root, "src"));
    const withDirective = "// eslint-disable-next-line no-eval\neval('1');\n";
    fs.writeFileSync(path.join(root, "src", "hidden.ts"), withDirective);
    fs.writeFileSync(path.join(root, "src", "plain.ts"), "export const x = 1;\n");
    fs.writeFileSync(path.join(root, "src", "notes.md"), "// eslint-disable\n");

    const found = findFilesWithForeignDirectives(root);
    expect(found.map((file) => file.relativePath)).toEqual(["src/hidden.ts"]);
    expect(found[0].content).toHaveLength(withDirective.length);
    expect(found[0].content).not.toContain("eslint-disable");

    // Explicit candidates: absolute and relative paths, duplicates, escapes and unreadable files.
    const candidates = [
      path.join(root, "src", "hidden.ts"),
      "src/hidden.ts",
      "../outside.ts",
      "src/missing.ts",
      "src/plain.ts",
    ];
    expect(findFilesWithForeignDirectives(root, candidates)).toHaveLength(1);

    const mirror = createDefusedMirror(found);
    try {
      expect(mirror.relativePaths).toEqual(["src/hidden.ts"]);
      expect(fs.readFileSync(path.join(mirror.directory, "src", "hidden.ts"), "utf-8")).toBe(found[0].content);
    } finally {
      mirror.dispose();
    }
    expect(fs.existsSync(mirror.directory)).toBe(false);
  });

  it("removes the temporary directory when mirroring fails", () => {
    const before = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("vue-doctor-mirror-"));
    const duplicates = [
      { relativePath: "a.ts", content: "1" },
      { relativePath: "a.ts", content: "2" },
    ];
    expect(() => createDefusedMirror(duplicates)).toThrow();
    const after = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("vue-doctor-mirror-"));
    expect(after.length).toBeLessThanOrEqual(before.length);
  });
});

describe("Node version support", () => {
  it.each([
    ["v22.12.0", true],
    ["22.13.1", true],
    ["v22.11.9", false],
    ["v20.19.0", false],
    ["v24.0.0", true],
    ["v25.1.0-nightly20250101", true],
    ["  v24.1.0\n", true],
    ["nonsense", false],
    ["", false],
  ])("isSupportedNodeVersion(%j) is %s", (version, expected) => {
    expect(isSupportedNodeVersion(version)).toBe(expected);
  });

  it("resolves the running Node binary only for supported versions", () => {
    expect(resolveNodeForOxlint()).toBe(process.execPath);
    vi.stubGlobal("process", Object.create(process, { version: { value: "v18.0.0" } }));
    expect(resolveNodeForOxlint()).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("getToolVersions", () => {
  it("reports the version of every analyzer package", () => {
    const versions = getToolVersions();
    expect(Object.keys(versions).sort()).toEqual(["eslint", "eslint-plugin-vue", "knip", "oxlint", "vue-eslint-parser"]);
    for (const version of Object.values(versions)) expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
