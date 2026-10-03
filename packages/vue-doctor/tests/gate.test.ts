import { describe, expect, it } from "vitest";
import type { DiagnoseResult } from "../src/core/diagnose.js";
import { EXIT_CODES, evaluateGate } from "../src/core/gate.js";
import type { Diagnostic } from "../src/types.js";

const finding = (severity: Diagnostic["severity"], status?: Diagnostic["status"]): Diagnostic => ({
  filePath: "src/App.vue",
  plugin: "vue-doctor",
  rule: "some-rule",
  severity,
  message: "message",
  help: "",
  line: 1,
  column: 1,
  category: "Correctness",
  status,
});

const result = (diagnostics: Diagnostic[], overrides: Partial<DiagnoseResult> = {}): DiagnoseResult => ({
  project: {
    rootDirectory: "/app",
    projectName: "app",
    vueVersion: "^3.5.0",
    framework: "vite",
    hasTypeScript: true,
    sourceFileCount: 1,
  },
  diagnostics,
  score: 90,
  scoreVersion: 2,
  rawScore: 90,
  scoreCap: null,
  categoryScores: [],
  impact: [],
  label: "Great",
  skipped: [],
  timings: { total: 1 },
  isDiffMode: false,
  offline: false,
  includePaths: [],
  suppressed: { count: 0, byRule: {} },
  foreignDirectives: 0,
  ...overrides,
});

describe("evaluateGate", () => {
  it("passes by default, even with errors (--fail-on none)", () => {
    expect(evaluateGate([result([finding("error")])]).exitCode).toBe(EXIT_CODES.ok);
  });

  it("fails on errors with --fail-on error, but not on warnings", () => {
    expect(evaluateGate([result([finding("error")])], { failOn: "error" }).exitCode).toBe(EXIT_CODES.gateBreached);
    expect(evaluateGate([result([finding("warning")])], { failOn: "error" }).exitCode).toBe(EXIT_CODES.ok);
  });

  it("fails on warnings with --fail-on warning", () => {
    const outcome = evaluateGate([result([finding("warning")])], { failOn: "warning" });
    expect(outcome.exitCode).toBe(EXIT_CODES.gateBreached);
    expect(outcome.reasons[0]).toContain("1 error/warning finding");
  });

  it("only counts new findings with --gate new", () => {
    const known = result([finding("error", "baseline"), finding("error", "existing")]);
    expect(evaluateGate([known], { failOn: "error", gate: "new" }).exitCode).toBe(EXIT_CODES.ok);
    expect(evaluateGate([known], { failOn: "error", gate: "all" }).exitCode).toBe(EXIT_CODES.gateBreached);

    const introduced = result([finding("error", "new"), finding("error", "baseline")]);
    const outcome = evaluateGate([introduced], { failOn: "error", gate: "new" });
    expect(outcome.exitCode).toBe(EXIT_CODES.gateBreached);
    expect(outcome.reasons[0]).toContain("1 new error finding");
  });

  it("treats findings without a reference point as new", () => {
    expect(evaluateGate([result([finding("error")])], { failOn: "error", gate: "new" }).exitCode).toBe(
      EXIT_CODES.gateBreached,
    );
  });

  it("compares --min-score against the capped overall score, not the raw score", () => {
    const capped = result([], {
      score: 50,
      rawScore: 99,
      scoreCap: { value: 50, reason: "security-error", ruleId: "vue-doctor/security/no-eval" },
    });
    expect(evaluateGate([capped], { minScore: 80 }).exitCode).toBe(EXIT_CODES.gateBreached);
  });

  it("fails when the score is below --min-score", () => {
    expect(evaluateGate([result([], { score: 79 })], { minScore: 80 }).exitCode).toBe(EXIT_CODES.gateBreached);
    expect(evaluateGate([result([], { score: 80 })], { minScore: 80 }).exitCode).toBe(EXIT_CODES.ok);
  });

  it("evaluates every project in a multi-project run", () => {
    const outcome = evaluateGate([result([]), result([finding("error")])], { failOn: "error" });
    expect(outcome.exitCode).toBe(EXIT_CODES.gateBreached);
    expect(outcome.reasons).toHaveLength(1);
  });

  it("exits 3 with --strict when an analyzer was skipped", () => {
    const skipped = result([finding("error")], { skipped: [{ analyzer: "dead-code", reason: "boom" }] });
    expect(evaluateGate([skipped], { failOn: "error", strict: true }).exitCode).toBe(EXIT_CODES.analyzerFailure);
    expect(evaluateGate([skipped], { failOn: "error" }).exitCode).toBe(EXIT_CODES.gateBreached);
  });
});
