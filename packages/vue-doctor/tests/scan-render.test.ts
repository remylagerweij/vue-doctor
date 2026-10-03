import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagnoseOptions, DiagnoseResult } from "../src/core/diagnose.js";
import type { Diagnostic } from "../src/types.js";
import { resolveScanConcurrency } from "../src/scan.js";
import { createMonorepo } from "./support/monorepo.js";
import { runCliInProcess } from "./support/run-cli-in-process.js";

// The text report, status footer and exit codes for results that are hard to provoke with the real
// analyzers (skipped analyzers, score caps, baselines). `diagnose` is replaced by canned results;
// everything above it (CLI, scan, rendering, gate) is real.
const diagnoseMock = vi.hoisted(() => ({ diagnose: vi.fn() }));
vi.mock("../src/core/diagnose.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/core/diagnose.js")>()),
  diagnose: diagnoseMock.diagnose,
}));

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLEAN_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "clean-vue");

const finding = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "src/A.vue",
  plugin: "vue-doctor",
  rule: "security/no-eval",
  severity: "error",
  message: "Do not use eval",
  help: "Use a parser",
  line: 1,
  column: 1,
  category: "Security",
  ...overrides,
});

const resultWith = (overrides: Partial<DiagnoseResult> = {}): DiagnoseResult => ({
  project: { rootDirectory: CLEAN_VUE_DIRECTORY, projectName: "demo", vueVersion: "^3.5.0", framework: "vite", hasTypeScript: true, sourceFileCount: 7 },
  diagnostics: [],
  suppressed: { count: 0, byRule: {} },
  foreignDirectives: 0,
  score: 100,
  label: "Great",
  scoreVersion: 2,
  rawScore: 100,
  scoreCap: null,
  categoryScores: [],
  impact: [],
  skipped: [],
  timings: { lint: 12, total: 34 },
  isDiffMode: false,
  includePaths: [],
  offline: false,
  ...overrides,
});

beforeEach(() => {
  diagnoseMock.diagnose.mockResolvedValue(resultWith());
});

afterEach(() => {
  diagnoseMock.diagnose.mockReset();
});

const scanText = (...flags: string[]) => runCliInProcess([CLEAN_VUE_DIRECTORY, "-y", "--no-cache", ...flags]);

describe("text report", () => {
  it("shows the banner with the discovered project details, the gauge and 'No issues found'", async () => {
    const run = await scanText();
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("clean-vue-fixture · Vue · Vue ^3.5.0");
    expect(run.stderr).toContain("1 source files");
    expect(run.stdout).toContain("Score: 100 — Great");
    expect(run.stdout).toContain("Completed in 0.0s");
    expect(run.stdout).toContain("█".repeat(50));
    expect(run.stdout).toContain("No issues found");
  });

  it("explains a capped score and lists categories worst first with the top three impact hints", async () => {
    diagnoseMock.diagnose.mockResolvedValue(
      resultWith({
        score: 50,
        rawScore: 80,
        label: "Needs work",
        scoreCap: { value: 50, reason: "security-error", ruleId: "vue-doctor/security/no-eval" },
        diagnostics: [finding(), finding({ severity: "warning", category: "Performance", rule: "performance/x", filePath: "src/B.vue" })],
        categoryScores: [
          { category: "Security", score: 50, label: "Poor", errors: 1, warnings: 0 },
          { category: "Performance", score: 90, label: "Great", errors: 0, warnings: 2 },
          { category: "Correctness", score: 95, label: "Great", errors: 2, warnings: 1 },
        ],
        impact: [
          { ruleId: "a", gain: 5 },
          { ruleId: "b", gain: 4 },
          { ruleId: "c", gain: 3 },
          { ruleId: "d", gain: 2 },
        ],
      }),
    );
    const run = await scanText();
    expect(run.stdout).toContain("Capped at 50 (would be 80) because of a high-confidence security error: vue-doctor/security/no-eval");
    expect(run.stdout).toMatch(/Security\s+50\s+1 error\n/);
    expect(run.stdout).toMatch(/Performance\s+90\s+2 warnings\n/);
    expect(run.stdout).toMatch(/Correctness\s+95\s+2 errors, 1 warning\n/);
    expect(run.stdout).toContain("Fixing a gains +5");
    expect(run.stdout).toContain("Fixing c gains +3");
    expect(run.stdout).not.toContain("Fixing d");
    expect(run.stderr).toContain("--verbose");
  });

  it("describes a critical-secret cap", async () => {
    diagnoseMock.diagnose.mockResolvedValue(
      resultWith({ score: 30, rawScore: 90, scoreCap: { value: 30, reason: "critical-secret", ruleId: "x" } }),
    );
    expect((await scanText()).stdout).toContain("because of a critical secret: x");
  });

  it("with --verbose lists each rule once with its help and at most three files", async () => {
    const files = ["a", "b", "c", "d", "e"].map((name) => `src/${name}.vue`);
    diagnoseMock.diagnose.mockResolvedValue(
      resultWith({
        diagnostics: [
          ...files.map((filePath) => finding({ filePath })),
          finding({ severity: "warning", rule: "security/other", help: "", filePath: "src/z.vue" }),
          finding({ severity: "warning", category: "Performance", rule: "performance/p", help: "", filePath: "src/z.vue" }),
        ],
      }),
    );
    const run = await scanText("--verbose");
    expect(run.stdout).toContain("Security: 5 errors, 1 warning");
    expect(run.stdout).toContain("Performance: 1 warning");
    expect(run.stdout).toContain("Do not use eval (×5)");
    expect(run.stdout).toContain("→ Use a parser");
    expect(run.stdout).toContain("src/a.vue");
    expect(run.stdout).not.toContain("src/d.vue");
    expect(run.stdout).toContain("... and 2 more files");
    expect(run.stderr).not.toContain("--verbose");
  });

  it("uses the singular for exactly four files and one error", async () => {
    diagnoseMock.diagnose.mockResolvedValue(
      resultWith({ diagnostics: ["a", "b", "c", "d"].map((name) => finding({ filePath: `src/${name}.vue` })) }),
    );
    expect((await scanText("--verbose")).stdout).toContain("... and 1 more file\n");
  });

  it("reports suppressed findings, baseline numbers and timings", async () => {
    diagnoseMock.diagnose.mockResolvedValue(
      resultWith({
        suppressed: { count: 1, byRule: {} },
        baseline: { path: "/b.json", matched: 4, new: 2, fixed: 3 },
      }),
    );
    const one = await scanText("--timings");
    expect(one.stderr).toContain("1 finding suppressed by vue-doctor-disable comments");
    expect(one.stderr).toContain("Baseline: 2 new, 4 known, 3 fixed");
    expect(one.stderr).toContain("Timings: lint 12ms, total 34ms");

    diagnoseMock.diagnose.mockResolvedValue(
      resultWith({ suppressed: { count: 3, byRule: {} }, baseline: { path: "/b.json", matched: 0, new: 1, fixed: null } }),
    );
    const many = await scanText();
    expect(many.stderr).toContain("3 findings suppressed");
    expect(many.stderr).toContain("Baseline: 1 new, 0 known\n");
  });
});

describe("skipped analyzers", () => {
  const skippedResult = () =>
    resultWith({
      skipped: [
        { analyzer: "dead-code", reason: "knip crashed\nstack line 1\nstack line 2" },
        { analyzer: "template", reason: "parser failed" },
      ],
    });

  it("warns once per run with the first line of each reason, and still exits 0", async () => {
    diagnoseMock.diagnose.mockResolvedValue(skippedResult());
    const run = await scanText();
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain("2 analyzers did not run — the results and score are incomplete");
    expect(run.stderr).toContain("• dead code checks: knip crashed");
    expect(run.stderr).not.toContain("stack line");
    expect(run.stderr).toContain("• template checks: parser failed");
    expect(run.stderr).toContain("Use --strict");
  });

  it("uses the singular and keeps the warning for --score and --json output", async () => {
    diagnoseMock.diagnose.mockResolvedValue(resultWith({ skipped: [{ analyzer: "lint", reason: "boom" }] }));
    const score = await scanText("--score");
    expect(score.stdout.trim()).toBe("100");
    expect(score.stderr).toContain("1 analyzer did not run");

    const json = await scanText("--json");
    expect(JSON.parse(json.stdout).format).toBe("vue-doctor/report@2");
    expect(json.stderr).toContain("lint checks: boom");
  });

  it("exits 3 with --strict and names the project and analyzer", async () => {
    diagnoseMock.diagnose.mockResolvedValue(skippedResult());
    const run = await scanText("--strict");
    expect(run.exitCode).toBe(3);
    expect(run.stderr).toContain("--strict: 2 analyzers did not run: demo: dead-code (");
  });

  it("lets an analyzer failure (3) win over a gate breach (1) across projects", async () => {
    const root = createMonorepo();
    try {
      diagnoseMock.diagnose.mockImplementation(async (directory: string) =>
        directory.endsWith("app-a")
          ? resultWith({ diagnostics: [finding()] })
          : resultWith({ skipped: [{ analyzer: "lint", reason: "boom" }] }),
      );
      const run = await runCliInProcess([root, "-y", "--no-cache", "--score", "--fail-on", "error", "--strict"]);
      expect(run.exitCode).toBe(3);
      expect(run.stderr).toContain("--fail-on error");
      expect(run.stderr).toContain("--strict");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("several projects", () => {
  it("scans in the given order, prefixes debug lines with the project and prints one block per project", async () => {
    const root = createMonorepo();
    try {
      diagnoseMock.diagnose.mockImplementation(async (directory: string, options: DiagnoseOptions) => {
        options.onDebug?.("lint", "hello");
        options.onProgress?.({ type: "start", analyzer: "lint" });
        options.onProgress?.({ type: "done", analyzer: "lint", durationMs: 1, count: 0 });
        options.onProgress?.({ type: "fail", analyzer: "dead-code", durationMs: 1, reason: "native binding missing" });
        return resultWith({ project: { ...resultWith().project, projectName: path.basename(directory), rootDirectory: directory }, score: directory.endsWith("app-a") ? 90 : 80 });
      });
      const run = await runCliInProcess([root, "-y", "--no-cache", "--debug"]);
      expect(run.exitCode).toBe(0);
      expect(run.stderr).toContain("vue-doctor:lint [app-a] hello");
      expect(run.stderr).toContain("vue-doctor:lint [app-b] hello");
      expect(run.stderr.indexOf("app-a · ")).toBeLessThan(run.stderr.indexOf("app-b · "));
      expect(run.stderr).toContain("✔ Running lint checks.");
      expect(run.stderr).toContain("native binding requires a compatible Node.js version");
      expect(run.stdout.indexOf("Score: 90")).toBeLessThan(run.stdout.indexOf("Score: 80"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails the whole batch when one project is not a Vue project", async () => {
    const root = createMonorepo();
    try {
      diagnoseMock.diagnose.mockImplementation(async (directory: string) => {
        if (directory.endsWith("app-b")) throw new Error("kaput in app-b");
        return resultWith();
      });
      const run = await runCliInProcess([root, "-y", "--no-cache", "--score"]);
      expect(run.exitCode).toBe(2);
      expect(run.stderr).toContain("kaput in app-b");
      expect(run.stdout).toBe("");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("resolveScanConcurrency", () => {
  it("is half the CPUs, at least 1, at most 4 and never more than the projects", () => {
    expect(resolveScanConcurrency(10, 1)).toBe(1);
    expect(resolveScanConcurrency(10, 4)).toBe(2);
    expect(resolveScanConcurrency(10, 64)).toBe(4);
    expect(resolveScanConcurrency(3, 64)).toBe(3);
    expect(resolveScanConcurrency(0, 8)).toBe(1);
    expect(resolveScanConcurrency(2)).toBeGreaterThanOrEqual(1);
  });
});
