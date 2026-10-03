import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { diagnose } from "../src/index.js";
import { buildReport } from "../src/report/build-report.js";
import { formatReport } from "../src/report/format-report.js";
import { formatGithub, GITHUB_ANNOTATION_LIMIT_PER_LEVEL } from "../src/report/format-github.js";
import type { Report, ReportFinding } from "../src/report/model.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const FIXTURES_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let basicReport: Report;
beforeAll(async () => {
  const directory = path.join(FIXTURES_DIRECTORY, "basic-vue");
  basicReport = buildReport([{ directory, result: await diagnose(directory, { force: true, deadCode: false }) }], {
    version: "2.0.0-test",
    generatedAt: null,
    scanDirectory: directory,
  });
});

const COMMAND_LINE = /^::(error|warning|notice) /;

const withFindings = (findings: ReportFinding[], root = "."): Report => ({
  ...basicReport,
  projects: [{ ...basicReport.projects[0], root, findings }],
});

const makeFinding = (overrides: Partial<ReportFinding> = {}): ReportFinding => ({
  ...basicReport.projects[0].findings[0],
  severity: "warning",
  confidence: "high",
  file: "src/App.vue",
  line: 3,
  column: 5,
  endLine: undefined,
  endColumn: undefined,
  message: "Message",
  help: "Help",
  docsUrl: "https://example.test/docs",
  ruleId: "vue-doctor/test/rule",
  ...overrides,
});

const linesOf = (text: string): string[] => text.split("\n").filter((line) => line !== "");

describe("GitHub annotations formatter", () => {
  it("emits one workflow command per finding, errors first", () => {
    const text = formatGithub(basicReport);
    const all = linesOf(text);
    // The fixture has more than 10 findings of a level, so a summary notice is appended.
    expect(all.at(-1)).toMatch(/^::notice title=Vue Doctor::/);
    const lines = all.slice(0, -1);
    expect(text.endsWith("\n")).toBe(true);
    expect(lines).toHaveLength(basicReport.projects[0].findings.length);
    for (const line of lines) expect(line).toMatch(COMMAND_LINE);
    const levels = lines.map((line) => line.split(" ")[0]);
    const rank = { "::error": 0, "::warning": 1, "::notice": 2 } as Record<string, number>;
    const ranks = levels.map((level) => rank[level]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(levels).toContain("::error");
  });

  it("builds file, position, title and message properties", () => {
    const text = formatGithub(
      withFindings([
        makeFinding({ line: 12, column: 3, endLine: 14, endColumn: 9, message: "Bad.", help: "Fix it.", ruleId: "vue-doctor/security/no-eval" }),
      ]),
    );
    expect(text).toBe(
      "::warning file=src/App.vue,line=12,col=3,endLine=14,endColumn=9,title=vue-doctor/security/no-eval::Bad.%0AFix it.%0ADocs: https://example.test/docs\n",
    );
  });

  it("omits unknown positions and maps severity and confidence to the level", () => {
    const lines = linesOf(
      formatGithub(
        withFindings([
          makeFinding({ severity: "error", line: 0, column: 0, ruleId: "a" }),
          makeFinding({ severity: "warning", confidence: "low", ruleId: "b", column: 0 }),
          makeFinding({ severity: "warning", confidence: "medium", ruleId: "c" }),
        ]),
      ),
    );
    expect(lines[0]).toMatch(/^::error file=src\/App\.vue,title=a::/);
    expect(lines[1]).toMatch(/^::warning file=src\/App\.vue,line=3,col=5,title=c::/);
    expect(lines[2]).toMatch(/^::notice file=src\/App\.vue,line=3,title=b::/);
  });

  it("prefixes the source root and the project root, resolving ..", () => {
    const [line] = linesOf(formatGithub(withFindings([makeFinding({ file: "src/App.vue" })], "packages/web"), { sourceRootPrefix: "apps/" }));
    expect(line).toContain("file=apps/packages/web/src/App.vue,");
    const [dot] = linesOf(formatGithub(withFindings([makeFinding({ file: "../shared/x.ts" })], "."), { sourceRootPrefix: "apps/web" }));
    expect(dot).toContain("file=apps/shared/x.ts,");
    const [windows] = linesOf(formatGithub(withFindings([makeFinding({ file: "src\\App.vue" })])));
    expect(windows).toContain("file=src/App.vue,");
  });

  it("escapes properties so paths and rule IDs with commas and colons stay one property", () => {
    const [line] = linesOf(formatGithub(withFindings([makeFinding({ file: "src/a,b:c%d.vue", ruleId: "x:y,z" })])));
    expect(line).toContain("file=src/a%2Cb%3Ac%25d.vue,line=3");
    expect(line).toContain("title=x%3Ay%2Cz::");
  });

  it("keeps injected workflow commands inert", () => {
    const attacks = [
      "boom\n::add-mask::secret",
      "boom\r\n::stop-commands::token",
      "::set-output name=x::y",
      "100% sure,\n::error::fake",
      "%0A::add-mask::encoded",
    ];
    for (const attack of attacks) {
      const text = formatGithub(
        withFindings([
          makeFinding({ message: attack, help: attack, docsUrl: attack, ruleId: attack, file: `${attack}.vue`, severity: "error" }),
          makeFinding({ message: attack, file: attack }),
        ]),
      );
      const lines = linesOf(text);
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line).toMatch(COMMAND_LINE);
        expect(line).not.toMatch(/[\r]/);
        // Exactly one command separator: `::level props::message`, the rest is escaped data.
        expect(line.split(/(?<=^::[a-z]+ [^:]*)::/).length).toBe(2);
        expect(line.slice(line.indexOf("::", 2) + 2)).not.toContain("\n");
      }
      expect(text.split("\n").filter((line) => line.startsWith("::") && !COMMAND_LINE.test(line))).toEqual([]);
    }
    const [line] = linesOf(formatGithub(withFindings([makeFinding({ message: "a\n::add-mask::s %0A" })])));
    expect(line).toContain("::a%0A::add-mask::s %250A");
  });

  it("never prints code frames", () => {
    const text = formatGithub(withFindings([makeFinding({ codeFrame: "> 1 | const secret = 'sk_live_123'" })]));
    expect(text).not.toContain("sk_live_123");
  });

  it("adds a final summary notice only when a level exceeds GitHub's per-level limit", () => {
    const limit = GITHUB_ANNOTATION_LIMIT_PER_LEVEL;
    const atLimit = linesOf(formatGithub(withFindings(Array.from({ length: limit }, () => makeFinding()))));
    expect(atLimit).toHaveLength(limit);

    const many = [
      ...Array.from({ length: limit + 2 }, (_, index) => makeFinding({ line: index + 1 })),
      makeFinding({ severity: "error", ruleId: "e" }),
    ];
    const lines = linesOf(formatGithub(withFindings(many)));
    expect(lines).toHaveLength(many.length + 1);
    expect(lines[0]).toMatch(/^::error /);
    const summary = lines.at(-1)!;
    expect(summary).toMatch(/^::notice title=Vue Doctor::/);
    expect(summary).toContain(`${many.length} findings (1 errors, ${limit + 2} warnings, 0 notices)`);
    expect(summary).toContain("--format sarif");
    expect(summary).toContain("--format json");
  });

  it("prints nothing without findings", () => {
    expect(formatGithub(withFindings([]))).toBe("");
  });

  it("is selectable through formatReport", () => {
    expect(formatReport(basicReport, "github", { sourceRootPrefix: "a" })).toBe(formatGithub(basicReport, { sourceRootPrefix: "a" }));
  });
});

describe("--format github (CLI)", () => {
  it("prints annotations on stdout with repo-relative paths and supports --output", () => {
    const env = { ...process.env, NO_COLOR: "1", CI: "1" };
    const basic = path.join(FIXTURES_DIRECTORY, "basic-vue");
    const stdoutRun = spawnSync(process.execPath, [CLI_PATH, basic, "--format", "github", "--no-dead-code", "--no-cache"], {
      encoding: "utf-8",
      env,
      cwd: FIXTURES_DIRECTORY,
    });
    expect(stdoutRun.status).toBe(0);
    const lines = linesOf(stdoutRun.stdout);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(COMMAND_LINE);
    expect(lines[0]).toContain("file=packages/vue-doctor/tests/fixtures/basic-vue/");

    const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-github-")), "out", "annotations.txt");
    const fileRun = spawnSync(process.execPath, [CLI_PATH, basic, "--format", "github", "--no-dead-code", "--no-cache", "--output", outputFile], {
      encoding: "utf-8",
      env,
      cwd: FIXTURES_DIRECTORY,
    });
    expect(fileRun.status).toBe(0);
    expect(fileRun.stdout).not.toMatch(/^::/m);
    expect(linesOf(fs.readFileSync(outputFile, "utf-8"))).toEqual(lines);
    fs.rmSync(path.dirname(path.dirname(outputFile)), { recursive: true, force: true });
  });
});
