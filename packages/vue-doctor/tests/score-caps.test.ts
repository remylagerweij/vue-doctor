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

// Real rules, so the caps come from registry metadata: no-eval is a high-confidence Security
// rule, no-hardcoded-secret is flagged `critical`, vue/no-template-target-blank is a Security warning.
const evalError = createDiagnostic({ rule: "no-eval", severity: "error", category: "Security" });
const secretError = createDiagnostic({ rule: "no-hardcoded-secret", severity: "error", category: "Security" });
const secretWarning = createDiagnostic({ rule: "no-hardcoded-secret", severity: "warning", category: "Security" });

describe("calculateScore: versioning", () => {
  it("reports the formula version", () => {
    expect(calculateScore([]).version).toBe(2);
  });
});

describe("calculateScore: category sub-scores", () => {
  it("applies the unique-rule penalty model per category, worst first", () => {
    const { categories } = calculateScore([
      createDiagnostic({ rule: "a", category: "Performance" }),
      createDiagnostic({ rule: "a", category: "Performance", line: 9 }),
      createDiagnostic({ rule: "b", category: "Reactivity", severity: "error" }),
      createDiagnostic({ rule: "c", category: "Reactivity", severity: "warning" }),
    ]);
    expect(categories).toEqual([
      { category: "Reactivity", score: 98, label: "Great", errors: 1, warnings: 1 },
      { category: "Performance", score: 99, label: "Great", errors: 0, warnings: 2 },
    ]);
  });

  it("omits categories without findings and breaks ties by name", () => {
    const { categories } = calculateScore([
      createDiagnostic({ rule: "x", category: "Server" }),
      createDiagnostic({ rule: "y", category: "Nuxt" }),
    ]);
    expect(categories.map((entry) => entry.category)).toEqual(["Nuxt", "Server"]);
  });

  it("never caps a category score", () => {
    expect(calculateScore([evalError]).categories[0]).toMatchObject({ category: "Security", score: 99 });
  });
});

describe("calculateScore: security caps", () => {
  it("caps at 50 for a high-confidence security error", () => {
    const result = calculateScore([evalError]);
    expect(result.rawScore).toBe(99);
    expect(result.score).toBe(50);
    expect(result.label).toBe("Needs work");
    expect(result.cap).toEqual({ value: 50, reason: "security-error", ruleId: "vue-doctor/security/no-eval" });
  });

  it("caps at 30 for a critical secret", () => {
    const result = calculateScore([secretError]);
    expect(result.score).toBe(30);
    expect(result.label).toBe("Critical");
    expect(result.cap).toMatchObject({ value: 30, reason: "critical-secret" });
  });

  it("applies the stricter cap (30) when both are present", () => {
    const result = calculateScore([evalError, secretError]);
    expect(result.score).toBe(30);
    expect(result.cap?.reason).toBe("critical-secret");
  });

  it("does not cap security warnings only", () => {
    const result = calculateScore([
      createDiagnostic({ rule: "vue/no-template-target-blank", plugin: "eslint-plugin-vue", severity: "warning", category: "Security" }),
      secretWarning,
    ]);
    expect(result.cap).toBeNull();
    expect(result.score).toBe(result.rawScore);
  });

  it("does not cap errors of non-security rules", () => {
    const result = calculateScore([createDiagnostic({ rule: "x", severity: "error", category: "Correctness" })]);
    expect(result.cap).toBeNull();
    expect(result.score).toBe(99);
  });

  it("reports a cap only when it lowers the score", () => {
    const filler = Array.from({ length: 70 }, (_, index) => createDiagnostic({ rule: `warn-${index}` }));
    const result = calculateScore([evalError, ...filler]);
    expect(result.rawScore).toBeLessThan(50);
    expect(result.score).toBe(result.rawScore);
    expect(result.cap).toBeNull();
  });
});

describe("calculateScore: impact hints", () => {
  it("computes the exact gain of removing every finding of a rule, largest first", () => {
    const { score, impact } = calculateScore([
      createDiagnostic({ rule: "warn-a", category: "Performance" }),
      createDiagnostic({ rule: "warn-a", category: "Performance", line: 2 }),
      createDiagnostic({ rule: "err-b", severity: "error", category: "Correctness" }),
      createDiagnostic({ rule: "err-c", severity: "error", category: "Correctness" }),
    ]);
    // 100 - 1.5 - 1.5 - 0.75 = 96.25 -> 96. Without err-b: 97.75 -> 98 (+2); without warn-a: 97 (+1).
    expect(score).toBe(96);
    expect(impact).toEqual([
      { ruleId: "vue-doctor/err-b", gain: 2 },
      { ruleId: "vue-doctor/err-c", gain: 2 },
      { ruleId: "vue-doctor/warn-a", gain: 1 },
    ]);
  });

  it("accounts for the cap: removing the capping rule lifts the cap", () => {
    const result = calculateScore([evalError, createDiagnostic({ rule: "warn-a" })]);
    expect(result.score).toBe(50);
    // Without no-eval: 99.25 -> 99 (+49). Removing the warning gains nothing under the cap, so it is omitted.
    expect(result.impact).toEqual([{ ruleId: "vue-doctor/security/no-eval", gain: 49 }]);
  });

  it("lifts only to the next cap when a second capping rule remains", () => {
    const result = calculateScore([evalError, secretError]);
    expect(result.score).toBe(30);
    // Removing the secret leaves the 50 cap (+20); removing no-eval changes nothing (still 30).
    expect(result.impact).toEqual([{ ruleId: "vue-doctor/security/no-hardcoded-secret", gain: 20 }]);
  });

  it("is empty for a clean project", () => {
    expect(calculateScore([]).impact).toEqual([]);
  });
});
