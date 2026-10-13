import { describe, expect, it } from "vitest";
import { isTestFile } from "../src/plugin/test-files.js";

describe("isTestFile", () => {
  it.each([
    "app/components/Modal.spec.ts",
    "src/utils/format.test.mts",
    "src/App.spec.vue",
    "tests/e2e/search.ts",
    "test/setup.ts",
    "app/utils/avatar/__fixtures__/images.ts",
    "src/__tests__/store.ts",
    "src/__mocks__/supabase.ts",
    "e2e/login.ts",
    "cypress/support/commands.ts",
    "src/checkout.cy.ts",
    "playwright.config.ts",
    "playwright.preview.config.ts",
    "vitest.config.mts",
    "vitest.component.config.ts",
  ])("matches %s", (filename) => {
    expect(isTestFile(filename)).toBe(true);
  });

  it.each([
    "app/components/TestimonialCard.vue",
    "app/pages/contest.vue",
    "src/utils/attest.ts",
    "app/composables/useLatestPrices.ts",
    "vite.config.ts",
    "nuxt.config.ts",
  ])("does not match %s", (filename) => {
    expect(isTestFile(filename)).toBe(false);
  });

  it("matches the path relative to the project, not the checkout location", () => {
    expect(isTestFile("/home/ci/test/app/components/Chart.vue", "/home/ci/test/app")).toBe(false);
    expect(isTestFile("/home/ci/test/app/tests/chart.ts", "/home/ci/test/app")).toBe(true);
  });
});
