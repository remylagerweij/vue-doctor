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
  ruleSource?: string; // Optional for brevity
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
      it(`${ruleName} (${testCase.fixture})`, () => {
        const issues = findDiagnosticsByRule(getDiagnostics(), ruleName);
        expect(issues.length, `Expected rule ${ruleName} to report issues in ${testCase.fixture}`).toBeGreaterThan(0);
        if (testCase.severity) expect(issues[0].severity).toBe(testCase.severity);
        if (testCase.category) expect(issues[0].category).toBe(testCase.category);
      });
    }
  });
};

let basicVueDiagnostics: Diagnostic[];

describe("runOxlint", () => {
  it("loads basic-vue diagnostics", async () => {
    basicVueDiagnostics = await runOxlint(BASIC_VUE_DIRECTORY, true, "nuxt"); // Use nuxt to enable Nuxt rules
    expect(basicVueDiagnostics.length).toBeGreaterThan(0);
  }, 20000);

  it("returns diagnostics with required fields", () => {
    for (const diagnostic of basicVueDiagnostics) {
      expect(diagnostic).toHaveProperty("filePath");
      expect(diagnostic).toHaveProperty("rule");
      expect(diagnostic).toHaveProperty("severity");
      expect(diagnostic).toHaveProperty("message");
    }
  });

  describeRules(
    "Reactivity Rules",
    {
      "no-fetch-in-watch": { fixture: "reactivity-issues.vue", severity: "error" },
      "no-cascading-mutations": { fixture: "reactivity-issues.vue" },
      "no-watch-for-computed": { fixture: "reactivity-issues.vue", severity: "error" },
      "no-ref-from-prop": { fixture: "reactivity-issues.vue" },
      "prefer-computed": { fixture: "reactivity-issues.vue" },
      "no-reactive-replace": { fixture: "reactivity-issues.vue" },
      "no-missing-await-nextTick": { fixture: "reactivity-issues.vue" },
      "no-reactive-destructure": { fixture: "reactivity-issues.vue" },
      "no-mutation-in-computed": { fixture: "reactivity-issues.vue", severity: "error" },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "Architecture Rules",
    {
      "no-giant-component": { fixture: "architecture-issues.vue" },
      "no-nested-component-definition": { fixture: "vue-specific-issues.vue" },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "Performance Rules",
    {
      "no-layout-property-animation": { fixture: "performance-issues.vue", severity: "error" },
      "no-transition-all": { fixture: "performance-issues.vue" },
      "no-global-css-variable-animation": { fixture: "performance-issues.vue" },
      "no-large-animated-blur": { fixture: "performance-issues.vue" },
      "no-scale-from-zero": { fixture: "performance-issues.vue" },
      "no-permanent-will-change": { fixture: "performance-issues.vue" },
      "no-deep-watch": { fixture: "performance-issues.vue" },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "Security Rules",
    {
      "no-secrets-in-client-code": { fixture: "security-issues.vue", severity: "error" },
      "no-v-html": { fixture: "security-issues.vue" },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "Bundle Size Rules",
    {
      "no-barrel-import": { fixture: "bundle-issues.vue" },
      "no-full-lodash-import": { fixture: "bundle-issues.vue" },
      "no-moment": { fixture: "bundle-issues.vue" },
      "prefer-dynamic-import": { fixture: "bundle-issues.vue" },
      // "no-undeferred-third-party": { fixture: "bundle-issues.vue" }, // Need specific setup
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "Correctness Rules",
    {
      "no-array-index-as-key": { fixture: "correctness-issues.vue" },
      "no-prevent-default": { fixture: "correctness-issues.vue" },
      "no-direct-dom-manipulation": { fixture: "correctness-issues.vue" },
      "prefer-defineProps-destructure": { fixture: "correctness-issues.vue" },
      "no-this-in-setup": { fixture: "correctness-issues.vue", severity: "error" },
      "require-defineprops-types": { fixture: "correctness-issues.vue" },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "Vue Specific Rules",
    {
      "no-async-setup-without-suspense": { fixture: "vue-specific-issues.vue" },
      "require-emits-declaration": { fixture: "vue-specific-issues.vue" },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "Nuxt Rules",
    {
      "nuxt-no-img-element": { fixture: "nuxt-issues.vue" },
      "nuxt-no-a-element": { fixture: "nuxt-issues.vue" },
      "nuxt-no-head-import": { fixture: "nuxt-issues.vue" },
      "nuxt-no-client-fetch-for-server-data": { fixture: "nuxt-issues.vue" },
      // "nuxt-async-client-component": { fixture: "nuxt-issues.vue" }, // defaults check requires structure
      "nuxt-no-window-in-ssr": { fixture: "nuxt-issues.vue", severity: "error" },
      "nuxt-require-seo-meta": { fixture: "nuxt-issues.vue" },
      "nuxt-no-process-env-in-client": { fixture: "nuxt-issues.vue" },
      // "nuxt-require-server-route-error-handling": { fixture: "nuxt-issues.vue" },
    },
    () => basicVueDiagnostics,
  );

  describeRules(
    "JS Performance Rules",
    {
      "async-parallel": { fixture: "js-perf-issues.ts" },
      "js-combine-iterations": { fixture: "js-perf-issues.ts" },
      "js-tosorted-immutable": { fixture: "js-perf-issues.ts" },
      "js-hoist-regexp": { fixture: "js-perf-issues.ts" },
      "js-min-max-loop": { fixture: "js-perf-issues.ts" },
      "js-set-map-lookups": { fixture: "js-perf-issues.ts" },
      "js-batch-dom-css": { fixture: "js-perf-issues.ts" },
      "js-index-maps": { fixture: "js-perf-issues.ts" },
      "js-cache-storage": { fixture: "js-perf-issues.ts" },
      "js-early-exit": { fixture: "js-perf-issues.ts" },
      "client-passive-event-listeners": { fixture: "performance-issues.vue" },
    },
    () => basicVueDiagnostics,
  );
});
