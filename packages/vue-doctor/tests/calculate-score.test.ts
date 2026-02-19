import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/types.js";
import { calculateScore } from "../src/utils/calculate-score.js";

const createDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "test.vue",
  plugin: "vue-doctor",
  rule: "test-rule",
  severity: "warning",
  message: "Test message",
  help: "Test help",
  line: 1,
  column: 1,
  category: "Test",
  ...overrides,
});

describe("calculateScore", () => {
  it("returns 100 / Perfect for empty diagnostics", async () => {
    const result = await calculateScore([]);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(100);
    expect(result!.label).toBe("Perfect");
  });

  it("returns lower score for more unique rule violations", async () => {
    // Score is based on unique rule count, not diagnostic count
    const few = await calculateScore([createDiagnostic({ rule: "rule-a" })]);
    const many = await calculateScore([
      createDiagnostic({ rule: "rule-a" }),
      createDiagnostic({ rule: "rule-b" }),
      createDiagnostic({ rule: "rule-c" }),
      createDiagnostic({ rule: "rule-d" }),
      createDiagnostic({ rule: "rule-e" }),
    ]);

    expect(few).not.toBeNull();
    expect(many).not.toBeNull();
    expect(few!.score).toBeGreaterThan(many!.score);
  });

  it("penalizes errors more than warnings", async () => {
    const warnings = await calculateScore([
      createDiagnostic({ severity: "warning", rule: "warn-a" }),
      createDiagnostic({ severity: "warning", rule: "warn-b" }),
      createDiagnostic({ severity: "warning", rule: "warn-c" }),
    ]);
    const errors = await calculateScore([
      createDiagnostic({ severity: "error", rule: "err-a" }),
      createDiagnostic({ severity: "error", rule: "err-b" }),
      createDiagnostic({ severity: "error", rule: "err-c" }),
    ]);

    expect(warnings).not.toBeNull();
    expect(errors).not.toBeNull();
    expect(warnings!.score).toBeGreaterThan(errors!.score);
  });

  it("never returns below 0", async () => {
    const diagnostics = Array.from({ length: 100 }, (_, i) =>
      createDiagnostic({ severity: "error", rule: `rule-${i}` }),
    );
    const result = await calculateScore(diagnostics);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
  });

  it("returns Great for small number of issues", async () => {
    const result = await calculateScore([
      createDiagnostic({ rule: "rule-a" }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(70);
    expect(result!.label).toBe("Great");
  });
});
