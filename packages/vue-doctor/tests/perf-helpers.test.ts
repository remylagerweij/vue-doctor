import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/types.js";
import { findMonorepoRoot, isMonorepoRoot } from "../src/utils/find-monorepo-root.js";
import { filterDiagnostics } from "../src/utils/filter-diagnostics.js";
import { compileGlobPattern, matchGlobPattern } from "../src/utils/match-glob-pattern.js";
import { clearPackageJsonCache, readPackageJson } from "../src/utils/read-package-json.js";
import { runOxlint } from "../src/utils/run-oxlint.js";
import { mapWithConcurrency } from "../src/utils/map-with-concurrency.js";
import { resolveBatchConcurrency } from "../src/utils/run-bounded.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");
const SCRATCH_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", ".tmp-perf-helpers");
// Outside the repository, whose own package.json is a workspace root.
const makeOutsideRepoDirectory = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "vd-perf-"));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("resolveBatchConcurrency", () => {
  it("uses half the cores, at least 1 and at most 4", () => {
    expect(resolveBatchConcurrency(1)).toBe(1);
    expect(resolveBatchConcurrency(2)).toBe(1);
    expect(resolveBatchConcurrency(4)).toBe(2);
    expect(resolveBatchConcurrency(8)).toBe(4);
    expect(resolveBatchConcurrency(64)).toBe(4);
  });

  it("defaults to this machine within bounds", () => {
    const concurrency = resolveBatchConcurrency();
    expect(concurrency).toBeGreaterThanOrEqual(1);
    expect(concurrency).toBeLessThanOrEqual(os.availableParallelism());
  });
});

describe("mapWithConcurrency", () => {
  it("returns results in item order regardless of completion order", async () => {
    const delays = [30, 5, 20, 1, 10];
    const results = await mapWithConcurrency(delays, 3, async (delay, index) => {
      await sleep(delay);
      return `${index}:${delay}`;
    });
    expect(results).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10"]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      running++;
      peak = Math.max(peak, running);
      await sleep(5);
      running--;
    });
    expect(peak).toBe(3);
  });

  it("handles no items and limits below 1", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 0, async (item) => item * 2)).toEqual([2, 4]);
  });

  it("rejects with the first failure and stops starting new tasks", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([0, 1, 2, 3, 4, 5], 1, async (item) => {
        started.push(item);
        if (item === 1) throw new Error("boom");
        return item;
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([0, 1]);
  });
});

describe("compileGlobPattern", () => {
  const cases: [string, string, boolean][] = [
    ["src/a.vue", "src/a.vue", true],
    ["src/a.vue", "a.vue", true],
    ["src/xa.vue", "a.vue", false],
    ["src/components/Button.vue", "**/*.vue", true],
    ["src/components/Button.ts", "**/*.vue", false],
    ["src/legacy/deep/x.vue", "src/legacy/**", true],
    ["src/legacy/x.vue", "legacy/*.vue", true],
    ["src/legacy/deep/x.vue", "legacy/*.vue", false],
    ["a+b(1).vue", "a+b(1).vue", true],
    ["axb.vue", "a.b.vue", false],
  ];

  it.each(cases)("%s against %s -> %s", (filePath, pattern, expected) => {
    expect(compileGlobPattern(pattern)(filePath)).toBe(expected);
    expect(matchGlobPattern(filePath, pattern)).toBe(expected);
  });

  it("compiles each pattern once", () => {
    expect(compileGlobPattern("src/**/once.vue")).toBe(compileGlobPattern("src/**/once.vue"));
  });

  it("is stateless across repeated calls (no sticky regex state)", () => {
    const matcher = compileGlobPattern("**/*.vue");
    expect([1, 2, 3].map(() => matcher("a/b.vue"))).toEqual([true, true, true]);
  });
});

describe("filterDiagnostics with compiled matchers", () => {
  const diagnostic = (filePath: string, rule: string): Diagnostic => ({
    filePath,
    plugin: "vue-doctor",
    rule,
    severity: "warning",
    message: "m",
    help: "h",
    line: 1,
    column: 1,
    category: "Security",
  });

  it("applies ignore globs, ignored rules and severity overrides to many diagnostics", () => {
    const diagnostics = [
      diagnostic("src/legacy/a.vue", "no-eval"),
      diagnostic("src/new/b.vue", "no-eval"),
      diagnostic("src/new/c.vue", "no-unsafe-html-sink"),
      diagnostic("src/new/d.vue", "no-hardcoded-secret"),
    ];
    const result = filterDiagnostics(diagnostics, {
      rules: { "vue-doctor/security/no-eval": "error" },
      ignore: { files: ["src/legacy/**"], rules: ["vue-doctor/security/no-hardcoded-secret"] },
    });
    expect(result.map((entry) => [entry.filePath, entry.severity])).toEqual([
      ["src/new/b.vue", "error"],
      ["src/new/c.vue", "warning"],
    ]);
  });
});

describe("readPackageJson memoization", () => {
  let directory: string;

  beforeAll(() => {
    directory = makeOutsideRepoDirectory();
  });
  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("returns {} for a missing file", () => {
    expect(readPackageJson(path.join(directory, "missing", "package.json"))).toEqual({});
  });

  it("reuses the parsed result while the file is unchanged", () => {
    const file = path.join(directory, "package.json");
    fs.writeFileSync(file, JSON.stringify({ name: "one" }));
    expect(readPackageJson(file)).toBe(readPackageJson(file));
  });

  it("re-reads after the file changed (never stale across runs)", () => {
    const file = path.join(directory, "changing.json");
    fs.writeFileSync(file, JSON.stringify({ name: "first" }));
    expect(readPackageJson(file).name).toBe("first");
    // Same size, new content, mtime forced forward: still detected through the mtime.
    fs.writeFileSync(file, JSON.stringify({ name: "other" }));
    const later = new Date(Date.now() + 5_000);
    fs.utimesSync(file, later, later);
    expect(readPackageJson(file).name).toBe("other");
    // Different size is detected even with an identical mtime.
    fs.writeFileSync(file, JSON.stringify({ name: "a-much-longer-name" }));
    fs.utimesSync(file, later, later);
    expect(readPackageJson(file).name).toBe("a-much-longer-name");
  });

  it("does not cache invalid JSON and picks up the fix", () => {
    const file = path.join(directory, "broken.json");
    fs.writeFileSync(file, "{ nope");
    expect(() => readPackageJson(file)).toThrow();
    fs.writeFileSync(file, JSON.stringify({ name: "fixed" }));
    expect(readPackageJson(file).name).toBe("fixed");
  });

  it("forgets a deleted file and supports an explicit reset", () => {
    const file = path.join(directory, "gone.json");
    fs.writeFileSync(file, JSON.stringify({ name: "x" }));
    expect(readPackageJson(file).name).toBe("x");
    fs.rmSync(file);
    expect(readPackageJson(file)).toEqual({});
    clearPackageJsonCache();
  });

  it("keeps monorepo detection correct when workspaces are added between calls", () => {
    const root = fs.mkdtempSync(path.join(directory, "mono-"));
    const child = path.join(root, "packages", "app");
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "root" }));
    expect(isMonorepoRoot(root)).toBe(false);
    expect(findMonorepoRoot(child)).toBeNull();

    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }));
    const later = new Date(Date.now() + 5_000);
    fs.utimesSync(path.join(root, "package.json"), later, later);
    expect(isMonorepoRoot(root)).toBe(true);
    expect(findMonorepoRoot(child)).toBe(root);
  });
});

describe("runOxlint batches", () => {
  const BATCH_DIRECTORY = path.join(SCRATCH_DIRECTORY, "batches");

  afterAll(() => fs.rmSync(SCRATCH_DIRECTORY, { recursive: true, force: true }));

  it("spawns several concurrent batches and keeps the result identical to a single run", async () => {
    // Long directory names push the argv past the batch limit so the file list is split.
    const nested = path.join("a".repeat(120), "b".repeat(120));
    fs.mkdirSync(path.join(BATCH_DIRECTORY, nested), { recursive: true });
    fs.copyFileSync(path.join(BASIC_VUE_DIRECTORY, "package.json"), path.join(BATCH_DIRECTORY, "package.json"));
    const source = fs.readFileSync(path.join(BASIC_VUE_DIRECTORY, "security-issues.vue"), "utf-8");
    const files: string[] = [];
    for (let index = 0; index < 160; index++) {
      const relative = `${nested}/file-${String(index).padStart(3, "0")}.vue`.replace(/\\/g, "/");
      fs.writeFileSync(path.join(BATCH_DIRECTORY, relative), source);
      files.push(relative);
    }

    const commands: string[][] = [];
    const batched = await runOxlint(BATCH_DIRECTORY, false, "unknown", files, process.execPath, (argv) =>
      commands.push(argv),
    );
    expect(commands.length).toBeGreaterThan(1);

    const perFile = batched.length / files.length;
    expect(perFile).toBeGreaterThan(0);
    expect(Number.isInteger(perFile)).toBe(true);
    // Every file is linted exactly once, by exactly one batch.
    const reported = new Set(batched.map((entry) => entry.filePath.replace(/\\/g, "/")));
    expect([...reported].sort()).toEqual(files);
  }, 60_000);
});
