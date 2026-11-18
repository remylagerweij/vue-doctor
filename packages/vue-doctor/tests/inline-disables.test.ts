import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBaseline, writeBaseline } from "../src/core/baseline.js";
import { diagnose } from "../src/index.js";
import { ruleIdOf } from "../src/plugin/rule-ids.js";
import { runCliInProcess } from "./support/run-cli-in-process.js";

const temporaryDirectories: string[] = [];
const makeProject = (files: Record<string, string>): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-inline-disables-"));
  temporaryDirectories.push(directory);
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "inline-disables-fixture", private: true, dependencies: { vue: "^3.5.0" } }),
  );
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), content);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const FAST = { deadCode: false, projectChecks: false, cache: false } as const;
type Result = Awaited<ReturnType<typeof diagnose>>;
const rulesOf = (result: Result, file: string): string[] =>
  result.diagnostics.filter((d) => d.filePath === file).map(ruleIdOf);

const EVAL = "vue-doctor/security/no-eval";
const V_HTML = "vue-doctor/security/no-unsafe-html-sink";

/** Each directive form, in .ts, in a .vue script and in a .vue template. */
const CASES: Array<{ name: string; file: string; source: string; rule: string }> = [
  { name: "disable-next-line in .ts", file: "a.ts", rule: EVAL, source: `// vue-doctor-disable-next-line ${EVAL}\neval("1");\n` },
  { name: "disable-line in .ts", file: "b.ts", rule: EVAL, source: `eval("1"); // vue-doctor-disable-line\n` },
  { name: "disable-file in .ts", file: "c.ts", rule: EVAL, source: `/* vue-doctor-disable-file */\neval("1");\n` },
  { name: "disable/enable range in .ts", file: "d.ts", rule: EVAL, source: `/* vue-doctor-disable ${EVAL} */\neval("1");\n/* vue-doctor-enable ${EVAL} */\n` },
  {
    name: "disable-next-line in .vue script",
    file: "e.vue",
    rule: EVAL,
    source: `<script setup lang="ts">\n// vue-doctor-disable-next-line ${EVAL}\neval("1");\n</script>\n<template><div /></template>\n`,
  },
  {
    name: "disable-next-line in .vue template",
    file: "f.vue",
    rule: V_HTML,
    source: `<script setup lang="ts">\nconst html = "<b>x</b>";\n</script>\n<template>\n  <!-- vue-doctor-disable-next-line ${V_HTML} -->\n  <div v-html="html"></div>\n</template>\n`,
  },
  {
    name: "disable-file in .vue template",
    file: "g.vue",
    rule: V_HTML,
    source: `<!-- vue-doctor-disable-file ${V_HTML} -->\n<script setup lang="ts">\nconst html = "<b>x</b>";\n</script>\n<template>\n  <div v-html="html"></div>\n</template>\n`,
  },
];

describe("inlineDisables: false (audit mode)", () => {
  for (const testCase of CASES) {
    it(`hides the finding by default and reports it when ignored: ${testCase.name}`, async () => {
      const directory = makeProject({ [testCase.file]: testCase.source });

      const normal = await diagnose(directory, FAST);
      expect(rulesOf(normal, testCase.file)).not.toContain(testCase.rule);
      expect(normal.suppressed.count).toBeGreaterThan(0);
      expect(normal.unsuppressed).toBeUndefined();

      const audit = await diagnose(directory, { ...FAST, inlineDisables: false });
      expect(rulesOf(audit, testCase.file)).toContain(testCase.rule);
      // Nothing is claimed as suppressed; the un-suppressed findings are counted instead.
      expect(audit.suppressed).toEqual({ count: 0, byRule: {} });
      expect(audit.unsuppressed?.count).toBe(normal.suppressed.count);
      expect(audit.unsuppressed?.byRule).toEqual(normal.suppressed.byRule);
      expect(audit.diagnostics.length).toBe(normal.diagnostics.length + normal.suppressed.count);
      expect(audit.score).toBeLessThanOrEqual(normal.score);
    }, 60_000);
  }

  it("keeps config ignore.rules and ignore.files in force", async () => {
    const directory = makeProject({
      "a.ts": `// vue-doctor-disable-next-line\neval("1");\n`,
      "b.ts": `eval("2");\n`,
    });
    const byRule = await diagnose(directory, { ...FAST, inlineDisables: false, config: { ignore: { rules: [EVAL] } } });
    expect(byRule.diagnostics.map(ruleIdOf)).not.toContain(EVAL);
    const byFile = await diagnose(directory, { ...FAST, inlineDisables: false, config: { ignore: { files: ["a.ts"] } } });
    expect(rulesOf(byFile, "a.ts")).toEqual([]);
    expect(rulesOf(byFile, "b.ts")).toContain(EVAL);
  }, 60_000);
});

describe("inlineDisables and baseline fingerprints", () => {
  // Two identical findings on identical source lines: the first is silenced by a comment.
  const SOURCE = [
    "export const first = (): unknown => {",
    `  // vue-doctor-disable-next-line ${EVAL}`,
    '  return eval("1");',
    "};",
    "export const second = (): unknown => {",
    '  return eval("1");',
    "};",
    "",
  ].join("\n");

  it("keeps normal-mode fingerprints identical when audit mode is on", async () => {
    const directory = makeProject({ "a.ts": SOURCE });
    const normal = await diagnose(directory, FAST);
    const audit = await diagnose(directory, { ...FAST, inlineDisables: false });
    const evalIn = (result: Result) => result.diagnostics.filter((d) => ruleIdOf(d) === EVAL);

    expect(evalIn(normal)).toHaveLength(1);
    expect(evalIn(audit)).toHaveLength(2);
    // The finding that is reported in normal mode keeps its fingerprint in audit mode.
    const known = evalIn(normal)[0];
    expect(evalIn(audit).filter((d) => d.fingerprint === known.fingerprint)).toEqual([
      expect.objectContaining({ line: known.line }),
    ]);
    // The formerly silenced finding gets a different fingerprint.
    expect(new Set(evalIn(audit).map((d) => d.fingerprint)).size).toBe(2);
  }, 60_000);

  it("points an audit run against a normal-mode baseline at the silenced finding, not the known one", async () => {
    const directory = makeProject({ "a.ts": SOURCE });
    const baselinePath = path.join(directory, "known.json");
    const recorded = await diagnose(directory, { ...FAST, baseline: null });
    writeBaseline(baselinePath, createBaseline(recorded.diagnostics));

    const audit = await diagnose(directory, { ...FAST, baseline: baselinePath, inlineDisables: false });
    const evals = audit.diagnostics.filter((d) => ruleIdOf(d) === EVAL).sort((a, b) => a.line - b.line);
    expect(evals.map((d) => [d.line, d.status])).toEqual([
      [3, "new"], // silenced by the comment: new to the baseline
      [6, "baseline"], // already known
    ]);
  }, 60_000);
});

describe("inlineDisables and the analysis cache", () => {
  it("never mixes results between runs with and without inline disables", async () => {
    const files = { "a.ts": `// vue-doctor-disable-next-line\neval("1");\n`, "b.ts": `eval("2");\n` };
    const directory = makeProject(files);
    const options = { deadCode: false, projectChecks: false } as const; // cache on
    const count = (result: Result): number => result.diagnostics.filter((d) => ruleIdOf(d) === EVAL).length;

    const coldNormal = await diagnose(directory, options);
    expect(coldNormal.cache?.misses.lint).toBeGreaterThan(0);
    expect(count(coldNormal)).toBe(1);

    // Warm cache, other mode: served from the cache, yet includes the suppressed finding too.
    const warmAudit = await diagnose(directory, { ...options, inlineDisables: false });
    expect(warmAudit.cache?.misses.lint).toBe(0);
    expect(count(warmAudit)).toBe(2);

    // And back: the audit run must not have poisoned the cache.
    const warmNormal = await diagnose(directory, options);
    expect(warmNormal.cache?.misses.lint).toBe(0);
    expect(count(warmNormal)).toBe(1);
    expect(warmNormal.suppressed.count).toBe(1);

    const warmAuditAgain = await diagnose(directory, { ...options, inlineDisables: false });
    expect(count(warmAuditAgain)).toBe(2);
    expect(warmAuditAgain.score).toBe(warmAudit.score);
    expect(warmNormal.score).toBeGreaterThanOrEqual(warmAudit.score);

    // Cold start in audit mode first, then normal.
    const other = makeProject(files);
    expect(count(await diagnose(other, { ...options, inlineDisables: false }))).toBe(2);
    expect(count(await diagnose(other, options))).toBe(1);
  }, 120_000);
});

describe("CLI --no-inline-disables", () => {
  const CLI_FAST = ["-y", "--no-dead-code", "--no-cache", "--no-timestamp"];
  interface JsonOutput {
    projects: Array<{
      findings: Array<{ ruleId: string }>;
      summary: { suppressed: number };
      inlineDisables?: { unsuppressed: { count: number } };
    }>;
  }

  it("reports suppressed findings with the flag and keeps the default without it", async () => {
    const directory = makeProject({ "a.ts": `// vue-doctor-disable-next-line ${EVAL}\neval("1");\n` });

    const normal = await runCliInProcess([directory, ...CLI_FAST, "--json"]);
    const normalProject = (JSON.parse(normal.stdout) as JsonOutput).projects[0];
    expect(normalProject.findings.map((f) => f.ruleId)).not.toContain(EVAL);
    expect(normalProject.summary.suppressed).toBe(1);
    expect(normalProject.inlineDisables).toBeUndefined();

    const audit = await runCliInProcess([directory, ...CLI_FAST, "--json", "--no-inline-disables"]);
    const auditProject = (JSON.parse(audit.stdout) as JsonOutput).projects[0];
    expect(auditProject.findings.map((f) => f.ruleId)).toContain(EVAL);
    expect(auditProject.summary.suppressed).toBe(0);
    expect(auditProject.inlineDisables?.unsuppressed.count).toBe(1);

    const text = await runCliInProcess([directory, ...CLI_FAST, "--no-inline-disables"]);
    const output = text.stdout + text.stderr;
    expect(output).toContain("Audit mode: vue-doctor-disable comments ignored, 1 finding reported");
    expect(output).not.toContain("suppressed by vue-doctor-disable");
  }, 120_000);

  it("counts un-suppressed findings toward the gate", async () => {
    const directory = makeProject({ "a.ts": `// vue-doctor-disable-next-line ${EVAL}\neval("1");\n` });
    const gated = await runCliInProcess([directory, ...CLI_FAST, "--score", "--fail-on", "error"]);
    const audit = await runCliInProcess([directory, ...CLI_FAST, "--score", "--fail-on", "error", "--no-inline-disables"]);
    expect(gated.exitCode).toBe(0);
    expect(audit.exitCode).toBe(1);
  }, 120_000);
});
