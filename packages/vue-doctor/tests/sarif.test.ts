import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { diagnose } from "../src/index.js";
import { buildReport, type ProjectResult } from "../src/report/build-report.js";
import { formatReport } from "../src/report/format-report.js";
import { formatSarif, SARIF_FINGERPRINT_KEY } from "../src/report/format-sarif.js";
import type { Report } from "../src/report/model.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const FIXTURES_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
// Official SARIF 2.1.0 schema, vendored from https://json.schemastore.org/sarif-2.1.0.json
const SARIF_SCHEMA_PATH = path.join(FIXTURES_DIRECTORY, "sarif-schema-2.1.0.json");

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSarif = ajv.compile(JSON.parse(fs.readFileSync(SARIF_SCHEMA_PATH, "utf-8")));

const expectValidSarif = (sarif: unknown): void => {
  const valid = validateSarif(sarif);
  expect(JSON.stringify(validateSarif.errors?.slice(0, 5) ?? [])).toBe("[]");
  expect(valid).toBe(true);
};

const buildFixturesReport = async (fixtures: string[], scanDirectory: string): Promise<Report> => {
  const projectResults: ProjectResult[] = [];
  for (const fixture of fixtures) {
    const directory = path.join(FIXTURES_DIRECTORY, fixture);
    projectResults.push({ directory, result: await diagnose(directory, { force: true, deadCode: false }) });
  }
  return buildReport(projectResults, { version: "2.0.0-test", generatedAt: null, scanDirectory });
};

let basicReport: Report;
let multiReport: Report;
beforeAll(async () => {
  basicReport = await buildFixturesReport(["basic-vue"], path.join(FIXTURES_DIRECTORY, "basic-vue"));
  multiReport = await buildFixturesReport(["basic-vue", "nuxt-app"], FIXTURES_DIRECTORY);
});

describe("SARIF formatter", () => {
  it("validates against the SARIF 2.1.0 schema for a single project", () => {
    const sarif = JSON.parse(formatSarif(basicReport));
    expectValidSarif(sarif);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    const [run] = sarif.runs;
    expect(run.tool.driver).toMatchObject({
      name: "Vue Doctor",
      semanticVersion: "2.0.0-test",
      informationUri: "https://remylagerweij.github.io/vue-doctor/",
    });
    expect(run.automationDetails.id).toBe("vue-doctor/");
    expect(run.results).toHaveLength(basicReport.projects[0].findings.length);
  });

  it("emits one run per project with distinct automation IDs and repo-relative paths", () => {
    const sarif = JSON.parse(formatSarif(multiReport));
    expectValidSarif(sarif);
    expect(sarif.runs).toHaveLength(2);
    const ids = sarif.runs.map((run: any) => run.automationDetails.id);
    expect(ids).toEqual(["vue-doctor/basic-vue/", "vue-doctor/nuxt-app/"]);
    for (const [index, run] of sarif.runs.entries()) {
      const prefix = ["basic-vue/", "nuxt-app/"][index];
      for (const result of run.results) {
        const location = result.locations[0].physicalLocation.artifactLocation;
        expect(location.uriBaseId).toBe("%SRCROOT%");
        expect(location.uri.startsWith(prefix)).toBe(true);
        expect(location.uri).not.toContain("\\");
      }
    }
  });

  it("re-roots locations, run IDs and fingerprints at the source root prefix", () => {
    const sarif = JSON.parse(formatSarif(multiReport, { sourceRootPrefix: "apps/web" }));
    expectValidSarif(sarif);
    expect(sarif.runs.map((run: any) => run.automationDetails.id)).toEqual([
      "vue-doctor/apps/web/basic-vue/",
      "vue-doctor/apps/web/nuxt-app/",
    ]);
    const [first] = sarif.runs[0].results;
    expect(first.locations[0].physicalLocation.artifactLocation.uri.startsWith("apps/web/basic-vue/")).toBe(true);
    expect(first.partialFingerprints[SARIF_FINGERPRINT_KEY]).toMatch(/:apps\/web\/basic-vue$/);

    const single = JSON.parse(formatSarif(basicReport, { sourceRootPrefix: "apps/web" }));
    expect(single.runs[0].automationDetails.id).toBe("vue-doctor/apps/web/");
    expect(single.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri.startsWith("apps/web/")).toBe(true);
  });

  it("indexes rules consistently and carries security metadata", () => {
    const sarif = JSON.parse(formatSarif(basicReport));
    const [run] = sarif.runs;
    const rules = run.tool.driver.rules;
    expect(new Set(rules.map((rule: any) => rule.id)).size).toBe(rules.length);
    for (const result of run.results) {
      expect(rules[result.ruleIndex].id).toBe(result.ruleId);
    }
    const securityRule = rules.find((rule: any) => rule.properties.tags.includes("security"));
    expect(securityRule).toBeDefined();
    expect(securityRule.properties["security-severity"]).toMatch(/^\d+\.\d$/);
    expect(securityRule.helpUri).toMatch(/^https:\/\/remylagerweij\.github\.io\/vue-doctor\//);
    const cweRule = rules.find((rule: any) => rule.properties.tags.some((tag: string) => tag.startsWith("external/cwe/cwe-")));
    expect(cweRule).toBeDefined();
    const nonSecurity = rules.find((rule: any) => !rule.properties.tags.includes("security"));
    expect(nonSecurity.properties["security-severity"]).toBeUndefined();
    expect(["high", "medium", "low"]).toContain(nonSecurity.properties.precision);
  });

  it("maps severity, regions and fingerprints", () => {
    const sarif = JSON.parse(formatSarif(basicReport));
    const findings = basicReport.projects[0].findings;
    const results = sarif.runs[0].results;
    findings.forEach((finding, index) => {
      const result = results[index];
      expect(result.level).toBe(finding.severity === "error" ? "error" : finding.confidence === "low" ? "note" : "warning");
      expect(result.message.text).toBe(finding.message);
      const region = result.locations[0].physicalLocation.region;
      if (finding.line >= 1) expect(region.startLine).toBe(finding.line);
      else expect(region).toBeUndefined();
      if (finding.column < 1 && region) expect(region.startColumn).toBeUndefined();
      expect(result.partialFingerprints[SARIF_FINGERPRINT_KEY]).toBe(finding.fingerprint);
    });
  });

  it("never includes source text, so secrets cannot leak", () => {
    const sarifText = formatSarif(basicReport);
    for (const finding of basicReport.projects[0].findings) {
      if (finding.codeFrame) {
        const sourceLine = finding.codeFrame.split("\n").find((line) => line.startsWith(">"))?.split(" | ").slice(1).join(" | ").trim();
        if (sourceLine && sourceLine.length > 25) expect(sarifText).not.toContain(sourceLine);
      }
    }
    expect(sarifText).not.toContain("codeFrame");
  });

  it("maps baseline status to baselineState", () => {
    const report = structuredClone(basicReport);
    const findings = report.projects[0].findings;
    findings[0].status = "new";
    findings[1].status = "baseline";
    findings[2].status = "existing";
    const results = JSON.parse(formatSarif(report)).runs[0].results;
    expect(results[0].baselineState).toBe("new");
    expect(results[1].baselineState).toBe("unchanged");
    expect(results[2].baselineState).toBe("unchanged");
    expect(results[3].baselineState).toBeUndefined();
    expectValidSarif(JSON.parse(formatSarif(report)));
  });

  it("handles whole-file findings and files with special characters", () => {
    const report = structuredClone(basicReport);
    report.projects[0].findings[0] = { ...report.projects[0].findings[0], line: 0, column: 0, file: "src/my file#1.vue" };
    const result = JSON.parse(formatSarif(report)).runs[0].results[0];
    expect(result.locations[0].physicalLocation.region).toBeUndefined();
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("src/my%20file%231.vue");
    expectValidSarif(JSON.parse(formatSarif(report)));
  });

  it("truncates deterministically at the result limit, keeping errors first, and warns", () => {
    const report = structuredClone(basicReport);
    const { findings } = report.projects[0];
    const errors = findings.filter((finding) => finding.severity === "error").length;
    const limit = Math.max(errors, 1) + 2;
    expect(findings.length).toBeGreaterThan(limit);
    const warn = vi.fn();
    const first = formatSarif(report, { maxResultsPerRun: limit, warn });
    const second = formatSarif(report, { maxResultsPerRun: limit });
    expect(first).toBe(second);
    expect(warn).toHaveBeenCalledOnce();
    const sarif = JSON.parse(first);
    expectValidSarif(sarif);
    expect(sarif.runs[0].results).toHaveLength(limit);
    expect(sarif.runs[0].results.filter((result: any) => result.level === "error")).toHaveLength(errors);
    expect(sarif.runs[0].properties.omittedResults).toBe(findings.length - limit);
  });

  it("shrinks the output when the gzip size limit is exceeded", () => {
    const warn = vi.fn();
    const full = formatSarif(basicReport);
    const small = formatSarif(basicReport, { maxGzipBytes: 1500, warn });
    expect(small.length).toBeLessThan(full.length);
    expect(warn).toHaveBeenCalled();
    expectValidSarif(JSON.parse(small));
  });

  it("is selectable through formatReport", () => {
    expect(formatReport(basicReport, "sarif")).toBe(formatSarif(basicReport));
  });
});

describe("--format sarif (CLI)", () => {
  it("prints valid SARIF on stdout and supports --output", () => {
    const env = { ...process.env, NO_COLOR: "1", CI: "1" };
    const basic = path.join(FIXTURES_DIRECTORY, "basic-vue");
    const stdoutRun = spawnSync(process.execPath, [CLI_PATH, basic, "--format", "sarif", "--no-dead-code", "--no-timestamp"], {
      encoding: "utf-8",
      env,
      cwd: FIXTURES_DIRECTORY,
    });
    expect(stdoutRun.status).toBe(0);
    const sarif = JSON.parse(stdoutRun.stdout);
    expectValidSarif(sarif);
    // Paths are relative to the git repository root, not to the working directory.
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri.startsWith("packages/vue-doctor/tests/fixtures/basic-vue/")).toBe(true);
    expect(sarif.runs[0].automationDetails.id).toBe("vue-doctor/packages/vue-doctor/tests/fixtures/basic-vue/");

    const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-sarif-")), "out", "vue-doctor.sarif");
    const fileRun = spawnSync(process.execPath, [CLI_PATH, basic, "--format", "sarif", "--no-dead-code", "--output", outputFile], {
      encoding: "utf-8",
      env,
      cwd: FIXTURES_DIRECTORY,
    });
    expect(fileRun.status).toBe(0);
    expectValidSarif(JSON.parse(fs.readFileSync(outputFile, "utf-8")));
    fs.rmSync(path.dirname(path.dirname(outputFile)), { recursive: true, force: true });
  });
});
