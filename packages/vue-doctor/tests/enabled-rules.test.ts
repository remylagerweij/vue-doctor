import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");

// Rules that were registered with severity "off" before LAG-236 and so never fired in a real scan.
const FORMERLY_DISABLED_RULES = {
  "security/no-eval": "error",
  "ecosystem/pinia-no-destructure": "warning",
  "ecosystem/pinia-no-watch-store": "warning",
  "ecosystem/router-no-string-push": "warning",
  "ecosystem/router-no-async-guard-without-next": "warning",
} as const;

describe("rules that used to be off by default", () => {
  it("fire on the basic-vue fixture through the built CLI", () => {
    const result = spawnSync(
      process.execPath,
      [CLI_PATH, BASIC_VUE_DIRECTORY, "-y", "--json", "--no-dead-code"],
      { encoding: "utf-8", env: { ...process.env, NO_COLOR: "1", CI: "1" } },
    );
    expect(result.status).toBe(0);

    const { projects } = JSON.parse(result.stdout) as {
      projects: { findings: { ruleId: string; severity: string }[] }[];
    };
    const allFindings = projects.flatMap((project) => project.findings);
    for (const [rule, severity] of Object.entries(FORMERLY_DISABLED_RULES)) {
      const findings = allFindings.filter((finding) => finding.ruleId === `vue-doctor/${rule}`);
      expect(findings.length, `${rule} should fire`).toBeGreaterThan(0);
      expect(new Set(findings.map((finding) => finding.severity)), rule).toEqual(new Set([severity]));
    }
  }, 120_000);
});
