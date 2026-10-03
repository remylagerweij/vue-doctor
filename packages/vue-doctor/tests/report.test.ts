import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnose } from "../src/index.js";
import { getRuleMeta } from "../src/plugin/registry.js";
import { buildAgentPrompt } from "../src/report/agent-prompt.js";
import { buildReport, type ProjectResult } from "../src/report/build-report.js";
import { formatJsonl } from "../src/report/format-report.js";
import {
  createReportJsonSchema,
  jsonlFindingSchema,
  jsonlSummarySchema,
  reportSchema,
  REPORT_FORMAT,
} from "../src/report/model.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const FIXTURES_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures");
const BASIC_VUE_DIRECTORY = path.join(FIXTURES_DIRECTORY, "basic-vue");
const REPORT_SCHEMA_PATH = path.join(PACKAGE_DIRECTORY, "schema", "report.schema.json");

// Spawning the CLI and running every analyzer is slow on CI runners and Windows.
vi.setConfig({ testTimeout: 120_000 });

const FIXTURES = fs
  .readdirSync(FIXTURES_DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(FIXTURES_DIRECTORY, entry.name, "package.json")))
  .map((entry) => entry.name);

const runCli = (args: string[]) =>
  spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const makeTemporaryDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-report-test-"));
  temporaryDirectories.push(directory);
  return directory;
};

const buildFixtureReport = async (fixture: string) => {
  const directory = path.join(FIXTURES_DIRECTORY, fixture);
  const result = await diagnose(directory, { force: true, deadCode: false });
  const projectResults: ProjectResult[] = [{ directory, result }];
  return buildReport(projectResults, { version: "2.0.0-test", generatedAt: null, scanDirectory: PACKAGE_DIRECTORY });
};

describe("report JSON Schema", () => {
  it("matches the published schema file (run `npm run schema:update` after changing the model)", async () => {
    await expect(`${JSON.stringify(createReportJsonSchema(), null, 2)}\n`).toMatchFileSnapshot(
      "../schema/report.schema.json",
    );
  });

  it("is published under the documented $id", () => {
    const schema = JSON.parse(fs.readFileSync(REPORT_SCHEMA_PATH, "utf-8")) as { $id: string };
    expect(schema.$id).toBe("https://remylagerweij.github.io/vue-doctor/schema/report.schema.json");
  });
});

describe("report@2 model", () => {
  it.each(FIXTURES)("validates against the zod schema and the published JSON Schema for fixture %s", async (fixture) => {
    const report = await buildFixtureReport(fixture);

    expect(reportSchema.parse(JSON.parse(JSON.stringify(report)))).toEqual(report);

    // The committed file, loaded back into a validator, accepts the report as well.
    const published = z.fromJSONSchema(JSON.parse(fs.readFileSync(REPORT_SCHEMA_PATH, "utf-8")));
    expect(published.safeParse(JSON.parse(JSON.stringify(report))).success).toBe(true);
  });

  it("rejects documents that are not report@2", async () => {
    const report = await buildFixtureReport("clean-vue");
    expect(reportSchema.safeParse({ ...report, format: "vue-doctor/report@1" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...report, projects: [{ name: "x" }] }).success).toBe(false);
  });

  it("describes findings with registry metadata, POSIX project-relative paths and code frames", async () => {
    const report = await buildFixtureReport("basic-vue");
    const [project] = report.projects;

    expect(report.format).toBe(REPORT_FORMAT);
    expect(project.root).toBe("tests/fixtures/basic-vue");
    expect(project.findings.length).toBeGreaterThan(0);
    for (const finding of project.findings) {
      expect(finding.file).not.toContain("\\");
      expect(path.isAbsolute(finding.file)).toBe(false);
      expect(finding.docsUrl).toMatch(/^https:\/\/remylagerweij\.github\.io\/vue-doctor\/rules\//);
      expect(finding.agentPrompt).toContain(finding.ruleId);
    }

    const secret = project.findings.find((finding) => finding.ruleId === "vue-doctor/security/no-secret-named-literal");
    const secretMeta = getRuleMeta("vue-doctor", "no-secret-named-literal");
    expect(secret).toMatchObject({ category: "Security", severity: secretMeta?.defaultSeverity, confidence: secretMeta?.confidence });
    expect(secret?.cwe?.length).toBeGreaterThan(0);
    // A credential finding never carries its source line, which would print the credential.
    expect(secret?.codeFrame).toBeUndefined();
  });

  it("groups rules with several findings into ruleGroups with one prompt each", async () => {
    const [project] = (await buildFixtureReport("basic-vue")).projects;
    const counts = new Map<string, number>();
    for (const finding of project.findings) counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
    const expected = [...counts].filter(([, count]) => count >= 2);
    expect(project.ruleGroups.map((group) => group.ruleId).sort()).toEqual(expected.map(([ruleId]) => ruleId).sort());
    for (const group of project.ruleGroups) {
      expect(group.count).toBe(counts.get(group.ruleId));
      expect(group.agentPrompt).toContain(group.ruleId);
    }
    const sortedGroups = [...project.ruleGroups].sort((a, b) => b.count - a.count || (a.ruleId < b.ruleId ? -1 : 1));
    expect(project.ruleGroups).toEqual(sortedGroups);
  });

  it("orders findings by file, line, column and rule", async () => {
    const [project] = (await buildFixtureReport("basic-vue")).projects;
    const keys = project.findings.map((finding) => [finding.file, finding.line, finding.column, finding.ruleId] as const);
    const sorted = [...keys].sort(
      (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) || a[1] - b[1] || a[2] - b[2] || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0),
    );
    expect(keys).toEqual(sorted);
  });

  it("orders projects by name and omits run-dependent fields without a timestamp", async () => {
    const results: ProjectResult[] = [];
    for (const fixture of ["nuxt-app", "clean-vue"]) {
      const directory = path.join(FIXTURES_DIRECTORY, fixture);
      results.push({ directory, result: await diagnose(directory, { force: true, lint: false, deadCode: false }) });
    }

    const reproducible = buildReport(results, { version: "2.0.0", generatedAt: null, scanDirectory: FIXTURES_DIRECTORY });
    expect(reproducible.projects.map((project) => project.name)).toEqual(["clean-vue-fixture", "nuxt-app-fixture"].sort());
    expect(reproducible.generatedAt).toBeUndefined();
    expect(reproducible.projects.every((project) => project.timings === undefined)).toBe(true);

    const stamped = buildReport(results, { version: "2.0.0", generatedAt: new Date("2026-01-02T03:04:05.000Z"), scanDirectory: FIXTURES_DIRECTORY });
    expect(stamped.generatedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(stamped.projects.every((project) => project.timings !== undefined)).toBe(true);
    expect(reportSchema.safeParse(stamped).success).toBe(true);
  });

  it("makes project roots relative to the scanned directory, with a dot for the project at it", async () => {
    const results: ProjectResult[] = [];
    for (const fixture of ["nuxt-app", "clean-vue"]) {
      const directory = path.join(FIXTURES_DIRECTORY, fixture);
      results.push({ directory, result: await diagnose(directory, { force: true, lint: false, deadCode: false }) });
    }

    const fromParent = buildReport(results, { version: "2.0.0", generatedAt: null, scanDirectory: FIXTURES_DIRECTORY });
    expect(fromParent.projects.map((project) => project.root)).toEqual(["clean-vue", "nuxt-app"]);

    const fromProject = buildReport(results.slice(0, 1), {
      version: "2.0.0",
      generatedAt: null,
      scanDirectory: results[0].directory,
    });
    expect(fromProject.projects[0].root).toBe(".");
  });

  it("builds an agent prompt from registry guidance and the finding", () => {
    const prompt = buildAgentPrompt(
      {
        ruleId: "vue-doctor/x",
        file: "src/A.vue",
        line: 3,
        message: "Bad.",
        help: "Fix it.",
        docsUrl: "https://example.com/x",
        codeFrame: "> 3 | bad()",
      },
    );
    expect(prompt).toContain("Rule: vue-doctor/x");
    expect(prompt).toContain("File: src/A.vue:3");
    expect(prompt).toContain("Guidance: Fix it.");
    expect(prompt).toContain("> 3 | bad()");
  });
});

describe("CLI --format", () => {
  it("prints a single report@2 document for --json and --format json, also for one project", () => {
    const viaAlias = runCli([BASIC_VUE_DIRECTORY, "-y", "--json", "--no-dead-code", "--no-timestamp"]);
    const viaFormat = runCli([BASIC_VUE_DIRECTORY, "-y", "--format", "json", "--no-dead-code", "--no-timestamp"]);

    expect(viaAlias.status).toBe(0);
    expect(viaAlias.stdout).toBe(viaFormat.stdout);
    const report = reportSchema.parse(JSON.parse(viaAlias.stdout));
    expect(report.projects).toHaveLength(1);
    expect(report.summary.projects).toBe(1);
  });

  it("is byte-identical across runs with --no-timestamp, and timestamped without it", () => {
    const args = [BASIC_VUE_DIRECTORY, "-y", "--format", "json", "--no-dead-code"];
    const first = runCli([...args, "--no-timestamp"]);
    const second = runCli([...args, "--no-timestamp"]);
    expect(first.stdout).toBe(second.stdout);
    expect(first.stdout).not.toContain("generatedAt");

    const stamped = reportSchema.parse(JSON.parse(runCli(args).stdout));
    expect(Number.isNaN(Date.parse(stamped.generatedAt ?? ""))).toBe(false);
    expect(stamped.projects[0].timings?.total).toBeTypeOf("number");
  });

  it("prints findings as JSONL with a summary as the last line", () => {
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--format", "jsonl", "--no-dead-code", "--no-timestamp"]);

    expect(result.status).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    const records = lines.map((line) => JSON.parse(line) as { type: string });
    const summary = jsonlSummarySchema.parse(records.at(-1));
    const findings = records.slice(0, -1).map((record) => jsonlFindingSchema.parse(record));

    expect(records.slice(0, -1).every((record) => record.type === "finding")).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.project === "basic-vue-fixture")).toBe(true);
    expect(summary.summary.errors + summary.summary.warnings).toBe(findings.length);
    expect(summary.projects[0].score.value).toBeTypeOf("number");
  });

  it("emits only the summary line for a project without findings", () => {
    const result = runCli([path.join(FIXTURES_DIRECTORY, "clean-vue"), "-y", "--format", "jsonl", "--no-dead-code"]);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(jsonlSummarySchema.parse(JSON.parse(lines[0])).summary.projects).toBe(1);
  });

  it("formats multi-project runs deterministically", async () => {
    const report = await buildFixtureReport("basic-vue");
    const lines = formatJsonl(report).trimEnd().split("\n");
    expect(JSON.parse(lines.at(-1) as string).type).toBe("summary");
    expect(lines.length).toBe(report.projects[0].findings.length + 1);
  });

  it("rejects an unknown format and conflicting --json/--format with exit code 2", () => {
    expect(runCli([BASIC_VUE_DIRECTORY, "-y", "--format", "xml"]).status).toBe(2);
    const conflict = runCli([BASIC_VUE_DIRECTORY, "-y", "--json", "--format", "jsonl"]);
    expect(conflict.status).toBe(2);
    expect(conflict.stderr).toContain("--json cannot be combined with --format jsonl");
  });
});

describe("CLI --output", () => {
  it("writes the report to a file (creating directories) and keeps stdout empty", () => {
    const target = path.join(makeTemporaryDirectory(), "nested", "report.json");
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--format", "json", "--no-dead-code", "--no-timestamp", "--output", target]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Report written to");
    expect(reportSchema.parse(JSON.parse(fs.readFileSync(target, "utf-8"))).projects).toHaveLength(1);
  });

  it("matches what stdout would have carried", () => {
    const target = path.join(makeTemporaryDirectory(), "report.jsonl");
    const args = [BASIC_VUE_DIRECTORY, "-y", "--format", "jsonl", "--no-dead-code", "--no-timestamp"];
    const toFile = runCli([...args, "--output", target]);
    const toStdout = runCli(args);

    expect(toFile.status).toBe(0);
    expect(fs.readFileSync(target, "utf-8")).toBe(toStdout.stdout);
  });

  it("requires a structured format", () => {
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--output", path.join(makeTemporaryDirectory(), "x.txt")]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--output requires --format json, jsonl, sarif, github, markdown or html");
  });

  it("does not change `baseline --output`", () => {
    const target = path.join(makeTemporaryDirectory(), "baseline.json");
    const result = runCli(["baseline", BASIC_VUE_DIRECTORY, "--output", target]);
    // The baseline command still owns its own --output (it exits 3 when an analyzer cannot run).
    expect([0, 3]).toContain(result.status);
    if (result.status === 0) expect(fs.existsSync(target)).toBe(true);
  });
});
