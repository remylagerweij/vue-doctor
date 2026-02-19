import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/types.js";
import { runOxlint } from "../src/utils/run-oxlint.js";

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "fixtures");
const BASIC_VUE_DIRECTORY = path.join(FIXTURES_DIRECTORY, "basic-vue");

const findDiagnosticsByRule = (diagnostics: Diagnostic[], rule: string): Diagnostic[] =>
  diagnostics.filter((diagnostic) => diagnostic.rule === rule);

interface RuleTestCase {
  fixture: string;
  ruleSource: string;
  severity?: "error" | "warning";
  category?: string;
}

const describeRules = (
  groupName: string,
  rules: Record<string, RuleTestCase>,
  getDiagnostics: () => Diagnostic[],
) => {
  describe(groupName, () => {
    for (const [ruleName, testCase] of Object.entries(rules)) {
      it(`${ruleName} (${testCase.fixture} → ${testCase.ruleSource})`, () => {
        const issues = findDiagnosticsByRule(getDiagnostics(), ruleName);
        expect(issues.length).toBeGreaterThan(0);
        if (testCase.severity) expect(issues[0].severity).toBe(testCase.severity);
        if (testCase.category) expect(issues[0].category).toBe(testCase.category);
      });
    }
  });
};

let basicVueDiagnostics: Diagnostic[];

describe("runOxlint", () => {
  it("loads basic-vue diagnostics", async () => {
    basicVueDiagnostics = await runOxlint(BASIC_VUE_DIRECTORY, true, "vite");
    expect(basicVueDiagnostics.length).toBeGreaterThan(0);
  }, 15000);

  it("returns diagnostics with required fields", () => {
    for (const diagnostic of basicVueDiagnostics) {
      expect(diagnostic).toHaveProperty("filePath");
      expect(diagnostic).toHaveProperty("plugin");
      expect(diagnostic).toHaveProperty("rule");
      expect(diagnostic).toHaveProperty("severity");
      expect(diagnostic).toHaveProperty("message");
      expect(diagnostic).toHaveProperty("category");
      expect(["error", "warning"]).toContain(diagnostic.severity);
      expect(diagnostic.message.length).toBeGreaterThan(0);
    }
  });

  it("only reports diagnostics from Vue/TS/JS files", () => {
    for (const diagnostic of basicVueDiagnostics) {
      expect(diagnostic.filePath).toMatch(/\.(vue|ts|js|tsx|jsx)$/);
    }
  });

  describeRules(
    "reactivity rules",
    {
      "no-ref-from-prop": {
        fixture: "reactivity-issues.vue",
        ruleSource: "rules/reactivity.ts",
        category: "Reactivity",
      },
      "no-watch-for-computed": {
        fixture: "reactivity-issues.vue",
        ruleSource: "rules/reactivity.ts",
        severity: "error",
      },
      "prefer-computed": {
        fixture: "reactivity-issues.vue",
        ruleSource: "rules/reactivity.ts",
      },
      "no-cascading-mutations": {
        fixture: "reactivity-issues.vue",
        ruleSource: "rules/reactivity.ts",
      },
      "no-fetch-in-watch": {
        fixture: "reactivity-issues.vue",
        ruleSource: "rules/reactivity.ts",
        severity: "error",
      },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "architecture rules",
    {
      "no-giant-component": {
        fixture: "architecture-issues.vue",
        ruleSource: "rules/architecture.ts",
        category: "Architecture",
      },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "performance rules",
    {
      "no-transition-all": {
        fixture: "performance-issues.vue",
        ruleSource: "rules/performance.ts",
        category: "Performance",
      },
      "no-layout-property-animation": {
        fixture: "performance-issues.vue",
        ruleSource: "rules/performance.ts",
        severity: "error",
      },
      "no-permanent-will-change": {
        fixture: "performance-issues.vue",
        ruleSource: "rules/performance.ts",
      },
      "no-scale-from-zero": {
        fixture: "performance-issues.vue",
        ruleSource: "rules/performance.ts",
      },
      "no-large-animated-blur": {
        fixture: "performance-issues.vue",
        ruleSource: "rules/performance.ts",
      },
      "client-passive-event-listeners": {
        fixture: "performance-issues.vue",
        ruleSource: "rules/client.ts",
      },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "security rules",
    {
      "no-secrets-in-client-code": {
        fixture: "security-issues.vue",
        ruleSource: "rules/security.ts",
        severity: "error",
        category: "Security",
      },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "bundle size rules",
    {
      "no-full-lodash-import": {
        fixture: "bundle-issues.vue",
        ruleSource: "rules/bundle-size.ts",
        category: "Bundle Size",
      },
      "no-moment": {
        fixture: "bundle-issues.vue",
        ruleSource: "rules/bundle-size.ts",
      },
      "prefer-dynamic-import": {
        fixture: "bundle-issues.vue",
        ruleSource: "rules/bundle-size.ts",
      },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "correctness rules",
    {
      "no-prevent-default": {
        fixture: "correctness-issues.vue",
        ruleSource: "rules/correctness.ts",
        category: "Correctness",
      },
      "no-direct-dom-manipulation": {
        fixture: "correctness-issues.vue",
        ruleSource: "rules/correctness.ts",
      },
      "prefer-defineProps-destructure": {
        fixture: "correctness-issues.vue",
        ruleSource: "rules/correctness.ts",
      },
    },
    () => basicVueDiagnostics,
  );
});
