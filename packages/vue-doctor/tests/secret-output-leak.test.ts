import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { diagnose } from "../src/index.js";
import { buildReport, type ProjectResult } from "../src/report/build-report.js";
import { formatReport, REPORT_FORMATS, type StructuredFormat } from "../src/report/format-report.js";
import type { Report } from "../src/report/model.js";
import { FAKE_PROVIDER_SECRETS, fakeBody } from "../src/plugin/secrets/fake-secrets.js";

// A scanned credential must never be echoed by Vue Doctor: not in a message, a code frame, an agent
// prompt, SARIF, GitHub annotations or Markdown. The credentials are assembled at run time (the
// repository itself holds no literal key) and planted in a temporary project.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const CLI_PATH = path.resolve(import.meta.dirname, "..", "dist", "cli.js");

const NAMED_SECRET = fakeBody(32, 77);
const PASSWORD = "hunter2hunter2";
const PROVIDER_SECRETS = FAKE_PROVIDER_SECRETS.filter(([label]) => label !== "private key").map(([, value]) => value);
// The distinctive part of each credential: a fragment must not leak either.
const fragments = (value: string): string[] => [value.slice(-24), value.slice(8, 40)].filter((part) => part.length >= 16);

const SOURCES: Record<string, string> = {
  "src/config.ts": [
    ...FAKE_PROVIDER_SECRETS.slice(0, 5).map(([, value], index) => `export const provider${index} = "${value}";`),
    `export const apiKey = "${NAMED_SECRET}";`,
    `export const password = "${PASSWORD}";`,
    "",
  ].join("\n"),
  "src/App.vue": `<script setup lang="ts">\nconst slack = "${FAKE_PROVIDER_SECRETS[6][1]}";\nconst stripe = \`${FAKE_PROVIDER_SECRETS[7][1]}\`;\n</script>\n<template><div>{{ slack }}{{ stripe }}</div></template>\n`,
  "server/api/charge.post.ts": `export default defineEventHandler(() => ({ key: "${FAKE_PROVIDER_SECRETS[8][1]}" }));\n`,
  "src/aws.ts": `export const aws = { accessKeyId: "${FAKE_PROVIDER_SECRETS[9][1]}" };\n`,
};

let directory = "";
let report: Report;

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-leak-"));
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "leak-fixture", private: true, dependencies: { vue: "^3.5.0" } }));
  for (const [file, content] of Object.entries(SOURCES)) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), content);
  }
  const result = await diagnose(directory, { force: true, deadCode: false, cache: false });
  const projects: ProjectResult[] = [{ directory, result }];
  report = buildReport(projects, { version: "2.0.0-test", generatedAt: null, scanDirectory: directory });
});

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

const everySecret = (): string[] => [...PROVIDER_SECRETS, NAMED_SECRET, PASSWORD, ...PROVIDER_SECRETS.flatMap(fragments), ...fragments(NAMED_SECRET)];

const expectNoSecret = (output: string, label: string): void => {
  for (const secret of everySecret()) {
    expect(output.includes(secret), `${label} output contains a credential`).toBe(false);
  }
};

describe("credential findings", () => {
  it("are reported (so the checks below are not vacuous)", () => {
    const ruleIds = new Set(report.projects.flatMap((project) => project.findings.map((finding) => finding.ruleId)));
    expect(ruleIds).toContain("vue-doctor/security/no-hardcoded-secret");
    expect(ruleIds).toContain("vue-doctor/security/no-secret-named-literal");
    const secretFindings = report.projects[0].findings.filter((finding) => finding.ruleId.includes("secret"));
    expect(secretFindings.length).toBeGreaterThanOrEqual(10);
    expect(report.projects[0].score.cap?.value).toBe(30);
  });

  it("never carry a code frame", () => {
    for (const finding of report.projects[0].findings.filter((entry) => entry.ruleId.includes("secret"))) {
      expect(finding.codeFrame).toBeUndefined();
    }
  });

  for (const format of REPORT_FORMATS.filter((entry): entry is StructuredFormat => entry !== "text")) {
    it(`never appear in ${format} output`, () => {
      expectNoSecret(formatReport(report, format), format);
    });
  }

  it("never appear in markdown with agent prompts", () => {
    expectNoSecret(formatReport(report, "markdown", { agentPrompts: true }), "markdown+prompts");
  });

  it("never appear in the text output", () => {
    const { stdout, stderr } = spawnSync(process.execPath, [CLI_PATH, directory, "--no-cache", "--no-dead-code"], {
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });
    expect(stdout).toContain("secret");
    expectNoSecret(`${stdout}\n${stderr}`, "text");
  });
});
