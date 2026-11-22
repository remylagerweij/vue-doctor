import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLUGIN_NAME, RULE_REGISTRY, getRuleMeta, toDiagnosticRule } from "../src/plugin/registry.js";
import templateCases from "../src/plugin/template-rules.cases.js";
import { resolvePluginPath } from "../src/utils/run-oxlint.js";
import { runEslintVue } from "../src/utils/run-eslint-vue.js";
import { loadTemplateRuleInputs } from "./fuzz/corpus.js";
import { isKnown, loadKnownFailures, triageFailures, type KnownFailure } from "./fuzz/known-failures.js";
import { runOxlintInstrumented } from "./fuzz/oxlint-engine.js";
import { createRandom, hashString } from "./fuzz/prng.js";
import { diffFindings, runFuzz, SMOKE_OPTIONS } from "./fuzz/run.js";
import { groupFailures } from "./fuzz/report.js";
import { MUTATORS } from "./fuzz/mutations.js";
import { analyzeScript, findScriptBlocks, findTopLevelBlockLines } from "./fuzz/source-structure.js";
import { createTemplateLinter } from "./fuzz/template-engine.js";
import { TRANSFORMS, TREE_TRANSFORMS } from "./fuzz/transforms.js";
import type { Failure, NormalizedFinding } from "./fuzz/types.js";

// The rule fuzzing harness lives in tests/fuzz; `npm run fuzz` runs it in full. This file keeps the
// normal suite fast: unit tests of the harness, a check that its template pass matches the
// production runner, and a small deterministic smoke run of the real thing.

const transform = (id: string) => {
  const found = TRANSFORMS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no transform ${id}`);
  return found;
};

describe("fuzz harness: seeded randomness", () => {
  it("produces the same sequence for the same seed and a different one otherwise", () => {
    const sequence = (seed: number): number[] => {
      const random = createRandom(seed);
      return Array.from({ length: 5 }, () => random.int(1000));
    };
    expect(sequence(7)).toEqual(sequence(7));
    expect(sequence(7)).not.toEqual(sequence(8));
    expect(hashString("a")).toBe(hashString("a"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });

  it("mutators are deterministic for a seed", () => {
    const code = "const a = 'x';\nconst b = a;\nfoo(b);\n";
    for (const mutator of MUTATORS) {
      expect(mutator.apply(code, createRandom(3), "const donor = 1;")).toBe(mutator.apply(code, createRandom(3), "const donor = 1;"));
    }
  });
});

describe("fuzz harness: metamorphic transforms", () => {
  const script = "import { ref } from 'vue';\n\n// keep\nconst a = ref('x');\nfunction go() {\n  const t = `line1\n  line2`;\n  return a.value + t;\n}\n";

  it("inserts blank lines above statements and reports where lines moved", () => {
    const result = transform("blank-lines").apply(script, "src/a.ts");
    expect(result).not.toBeNull();
    expect(result!.code).toContain("\n\n// keep\nconst a");
    expect(() => analyzeScript(result!.code)).not.toThrow();
    expect(analyzeScript(result!.code)).not.toBeNull();
    // `const a` was on line 4; every statement above it gained a line.
    const lines = result!.code.split("\n");
    expect(lines[result!.lineMap(4) - 1]).toBe("const a = ref('x');");
    expect(lines[result!.lineMap(8) - 1]).toBe("  return a.value + t;");
  });

  it("keeps leading comments attached to their statement", () => {
    const result = transform("comments").apply(script, "src/a.ts")!;
    expect(result.code).toContain("// fuzz comment\n// keep\nconst a");
  });

  it("never re-indents the inside of a template literal", () => {
    for (const id of ["indent-spaces", "indent-tabs", "indent-flatten"]) {
      const result = transform(id).apply(script, "src/a.ts")!;
      expect(result.code, id).toContain("line1\n  line2`");
    }
    expect(transform("indent-spaces").apply(script, "src/a.ts")!.code).toContain("    function go() {");
    expect(transform("indent-flatten").apply(script, "src/a.ts")!.code).toContain("\nreturn a.value");
  });

  it("swaps only quotes that can be swapped verbatim", () => {
    const code = `const a = 'plain';\nconst b = 'it"s';\nconst c = 'esc\\'d';\nconst d = \`'tpl'\`;\nconst e = "other";\n`;
    const double = transform("quotes-double").apply(code, "src/a.ts")!;
    expect(double.code).toBe(`const a = "plain";\nconst b = 'it"s';\nconst c = 'esc\\'d';\nconst d = \`'tpl'\`;\nconst e = "other";\n`);
    const single = transform("quotes-single").apply(code, "src/a.ts")!;
    expect(single.code).toContain("const e = 'other';");
    expect(single.code).toContain("const a = 'plain';");
  });

  it("rewrites the scripts of a single-file component and leaves the template alone", () => {
    const sfc = '<script setup>\nconst a = \'x\';\nconst b = a;\n</script>\n\n<template>\n  <p :title="\'q\'">{{ b }}</p>\n</template>\n';
    const blank = transform("blank-lines").apply(sfc, "src/Comp.vue")!;
    expect(blank.code).toContain("<script setup>\n\nconst a = 'x';\n\nconst b = a;");
    expect(blank.code).toContain("<template>\n  <p :title=\"'q'\">{{ b }}</p>");
    // `<template>` moved down by the blank line above `const b` plus the blank line above the block.
    expect(blank.code.split("\n")[blank.lineMap(6) - 1]).toBe("<template>");
    expect(transform("quotes-double").apply(sfc, "src/Comp.vue")!.code).toContain('const a = "x";');
    expect(transform("quotes-double").apply(sfc, "src/Comp.vue")!.code).toContain(`:title="'q'"`);
    expect(transform("lang-ts").apply(sfc, "src/Comp.vue")!.code).toContain('<script setup lang="ts">');
    expect(transform("lang-ts").apply('<script lang="js">\n</script>', "src/Comp.vue")).toBeNull();
  });

  it("finds top-level blocks but not nested <template> elements", () => {
    const sfc = "<template>\n<template v-if=\"a\">x</template>\n</template>\n<script>\n</script>\n<style>\n</style>\n";
    expect(findTopLevelBlockLines(sfc)).toEqual([4, 6]);
    expect(findScriptBlocks(sfc)).toHaveLength(1);
  });

  it("does not apply when it cannot be proven safe", () => {
    expect(transform("blank-lines").apply("const = ;", "src/a.ts")).toBeNull();
    expect(transform("indent-spaces").apply("const a = 1;\r\n", "src/a.ts")).toBeNull();
    expect(transform("lang-ts").apply("const a = 1;", "src/a.ts")).toBeNull();
    expect(transform("crlf").apply("a\r\nb\n", "src/a.ts")).toBeNull();
    expect(transform("blank-lines").apply("#!/usr/bin/env node\nconst a = 1;\n", "src/a.ts")!.code.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("applies line-ending, byte order mark and end-of-file rewrites to any file", () => {
    expect(transform("crlf").apply("a\nb\n", "x.env")!.code).toBe("a\r\nb\r\n");
    expect(transform("bom").apply("a", "x.env")!.code).toBe("﻿a");
    expect(transform("eof-blank-lines").apply("a\n", "x.env")!.code).toBe("a\n\n\n");
  });

  it("rewrites project files for the filesystem rules", () => {
    const tree = { id: "t", origin: "test", files: { "package.json": '{"a":1}', ".env": "A=1\n" } };
    const reindent = TREE_TRANSFORMS.find((candidate) => candidate.id === "json-reindent")!.apply(tree)!;
    expect(reindent.tree.files["package.json"]).toBe('{\n    "a": 1\n}\n');
    expect(reindent.tree.files[".env"]).toBe("A=1\n");
    expect(reindent.linesStable).toBe(false);
  });

  it("every transform of every input of the template cases still parses", () => {
    for (const input of loadTemplateRuleInputs()) {
      for (const candidate of TRANSFORMS) {
        const result = candidate.apply(input.code, input.filename);
        if (!result) continue;
        for (const block of findScriptBlocks(result.code)) {
          // lang="ts" can turn plain-JS-only syntax into an error and the structure is only built for LF text; every other rewrite must keep a script parseable.
          if (candidate.id === "lang-ts" || candidate.id === "crlf") continue;
          const baselineBlocks = findScriptBlocks(input.code);
          if (baselineBlocks.every((original) => analyzeScript(original.content) !== null)) {
            expect(analyzeScript(block.content), `${input.id} [${candidate.id}]`).not.toBeNull();
          }
        }
      }
    }
  });
});

describe("fuzz harness: comparing findings", () => {
  const finding = (rule: string, line: number, message = "m"): NormalizedFinding => ({ rule, file: "f", line, message });

  it("accepts findings that only moved with their lines", () => {
    expect(diffFindings([finding("r", 3)], [finding("r", 5)], (line) => line + 2, new Set())).toEqual(new Map());
  });

  it("names the rule that lost, gained or moved a finding", () => {
    const lost = diffFindings([finding("a", 1), finding("b", 2)], [finding("b", 2)], (line) => line, new Set());
    expect([...lost.keys()]).toEqual(["a"]);
    expect(lost.get("a")).toContain("lost");
    const moved = diffFindings([finding("a", 1)], [finding("a", 4)], (line) => line, new Set());
    expect(moved.get("a")).toContain("lost");
    expect(moved.get("a")).toContain("new");
    const changedMessage = diffFindings([finding("a", 1, "x")], [finding("a", 1, "y")], (line) => line, new Set());
    expect([...changedMessage.keys()]).toEqual(["a"]);
  });

  it("can ignore lines and rules", () => {
    expect(diffFindings([finding("a", 1)], [finding("a", 9)], (line) => line, new Set(), true)).toEqual(new Map());
    expect(diffFindings([finding("a", 1)], [], (line) => line, new Set(["a"]))).toEqual(new Map());
  });
});

describe("fuzz harness: known failures", () => {
  const failure = (overrides: Partial<Failure> = {}): Failure => ({
    oracle: "crash",
    engine: "oxlint",
    rule: "no-eval",
    input: "case:no-eval:invalid:x",
    variant: "baseline",
    detail: "",
    ...overrides,
  });
  const entry = (overrides: Partial<KnownFailure> = {}): KnownFailure => ({
    oracle: "crash",
    rule: "no-eval",
    reason: "a reason that is long enough",
    ...overrides,
  });

  it("matches on oracle and rule, and on optional engine, variant and input patterns", () => {
    expect(isKnown(entry(), failure())).toBe(true);
    expect(isKnown(entry({ oracle: "slowness" }), failure())).toBe(false);
    expect(isKnown(entry({ rule: "no-other" }), failure())).toBe(false);
    expect(isKnown(entry({ engine: "fs" }), failure())).toBe(false);
    expect(isKnown(entry({ variant: "crlf" }), failure())).toBe(false);
    expect(isKnown(entry({ input: "case:no-eval:*" }), failure())).toBe(true);
    expect(isKnown(entry({ input: "case:other:*" }), failure())).toBe(false);
    expect(isKnown(entry({ variant: "*+crlf" }), failure({ variant: "comments+crlf" }))).toBe(true);
    expect(isKnown(entry({ rule: "*" }), failure({ rule: "anything" }))).toBe(true);
  });

  it("splits failures into new and known and reports entries that matched nothing", () => {
    const triaged = triageFailures([failure(), failure({ rule: "no-open-redirect" })], [entry(), entry({ rule: "gone" })]);
    expect(triaged.known).toHaveLength(1);
    expect(triaged.unexpected.map((item) => item.rule)).toEqual(["no-open-redirect"]);
    expect(triaged.stale.map((item) => item.rule)).toEqual(["gone"]);
  });

  it("groups failures per rule and variant, collapsing mutators", () => {
    const groups = groupFailures([failure({ variant: "mutation:a" }), failure({ variant: "mutation:b", input: "x" }), failure({ variant: "crlf" })]);
    expect(groups.map((group) => [group.variant, group.count])).toEqual([
      ["crlf", 1],
      ["mutation", 2],
    ]);
  });

  it("keeps the committed allowlist well-formed: every entry names a rule that exists and says why", () => {
    const registered = new Set(RULE_REGISTRY.map((meta) => meta.id));
    for (const known of loadKnownFailures()) {
      expect(known.reason.length, `${known.rule}: reason`).toBeGreaterThan(30);
      if (known.rule !== "*") expect(registered.has(known.rule), `${known.rule} is not a registered rule`).toBe(true);
    }
  });
});

describe("fuzz harness: oracles detect what they claim to (instrumented oxlint)", () => {
  let directory = "";
  let faultyPlugin = "";

  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-fuzz-self-"));
    faultyPlugin = path.join(directory, "faulty-plugin.mjs");
    // The production bundle with one rule that throws and one that burns time, to prove the
    // harness attributes both to the right rule and keeps the other rules running.
    fs.writeFileSync(
      faultyPlugin,
      [
        `import production from ${JSON.stringify(pathToFileURL(resolvePluginPath()).href)};`,
        "const rules = { ...production.rules };",
        'rules["no-dynamic-code"] = { ...rules["no-dynamic-code"], create: () => ({ CallExpression() { throw new Error("boom from no-dynamic-code"); } }) };',
        'rules["no-prevent-default"] = { ...rules["no-prevent-default"], create: () => ({ Program() { const end = Date.now() + 120; while (Date.now() < end) {} } }) };',
        "export default { meta: production.meta, rules };",
      ].join("\n"),
    );
  });

  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("attributes a throwing rule, times a slow one and keeps the other rules' findings", async () => {
    const [result] = await runOxlintInstrumented([{ filename: "src/a.ts", code: 'export const result = eval("1 + 1");\n' }], { pluginPath: faultyPlugin });
    const crashed = result.timings.filter((timing) => timing.error);
    expect(crashed.map((timing) => timing.rule)).toEqual(["no-dynamic-code"]);
    expect(crashed[0].error).toContain("boom from no-dynamic-code");
    expect(result.findings.map((item) => item.rule)).toContain("no-eval");
    const slow = result.timings.find((timing) => timing.rule === "no-prevent-default");
    expect(slow?.ms ?? 0).toBeGreaterThanOrEqual(100);
    expect(result.timings.find((timing) => timing.rule === "no-eval")?.ms ?? 1000).toBeLessThan(100);
  });

  it("reports a failure of oxlint's plugin host as a host error, not as a syntax error", async () => {
    // A binary chain deeper than the host can walk makes oxlint answer with the anonymous "Error running JS plugin."
    const code = `export const value = ${Array.from({ length: 3600 }, (_unused, index) => `"s${index}"`).join(" + ")};\n`;
    const [result] = await runOxlintInstrumented([{ filename: "src/deep.ts", code }]);
    expect(result.hostErrors.length).toBeGreaterThan(0);
    expect(result.problems).toEqual([]);
  }, 60_000);

  it("separates syntax errors in the input from rule findings", async () => {
    const [result] = await runOxlintInstrumented([{ filename: "src/a.ts", code: "const = ;\n" }], { pluginPath: faultyPlugin });
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });
});

describe("fuzz harness: template pass matches the production runner", () => {
  let projectDirectory = "";
  const inputs = loadTemplateRuleInputs();
  const fileFor = (index: number): string => `${index}/${inputs[index].filename}`;

  beforeAll(() => {
    projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-fuzz-drift-"));
    inputs.forEach((input, index) => {
      const target = path.join(projectDirectory, fileFor(index));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, input.code);
    });
  });

  afterAll(() => fs.rmSync(projectDirectory, { recursive: true, force: true }));

  it("reports the same findings on every template case", async () => {
    const production = await runEslintVue(projectDirectory, undefined, "nuxt");
    const linter = await createTemplateLinter();
    const harness: string[] = [];
    for (const [index, input] of inputs.entries()) {
      const result = await linter.lint({ filename: fileFor(index), code: input.code });
      expect(result.crash, `${input.id} crashed`).toBeUndefined();
      for (const found of result.findings) {
        const own = getRuleMeta(PLUGIN_NAME, found.rule);
        harness.push(`${fileFor(index)}|${own ? toDiagnosticRule(own) : found.rule}|${found.line}|${found.message}`);
      }
    }
    const expected = production.map((item) => `${item.filePath}|${item.rule}|${item.line}|${item.message}`);
    expect(harness.sort()).toEqual(expected.sort());
    expect(expected.length).toBeGreaterThan(Object.keys(templateCases).length / 2);
  }, 120_000);

  it("measures the cost of chosen rules next to the cost of parsing, and ignores unknown rules", async () => {
    const linter = await createTemplateLinter();
    const slots = Array.from({ length: 300 }, (_unused, index) => `<template #s${index}>x</template>`).join("\n");
    const file = { filename: "Slots.vue", code: `<template><Comp>\n${slots}\n</Comp></template>\n` };
    const result = await linter.confirm(file, ["vue/valid-v-slot", "no-such-rule", "*"], 2);
    expect(result.rules.map((timing) => timing.rule)).toEqual(["vue/valid-v-slot", "*"]);
    expect(result.parseMs).toBeGreaterThan(0);
    for (const timing of result.rules) expect(timing.ms).toBeGreaterThanOrEqual(0);
    expect(result.fullMs).toBeGreaterThanOrEqual(result.parseMs);
  }, 60_000);
});

describe("rule fuzzing smoke run (full run: npm run fuzz)", () => {
  it("finds no crash, no slow rule and no metamorphic difference beyond the known failures", async () => {
    const result = await runFuzz({ ...SMOKE_OPTIONS });
    const triaged = triageFailures(result.failures, loadKnownFailures());
    const report = groupFailures(triaged.unexpected)
      .map((group) => `${group.oracle}/${group.engine}/${group.rule}/${group.variant} x${group.count}: ${group.examples[0].input} -- ${group.examples[0].detail}`)
      .join("\n");
    expect(report, "new fuzzing failures (fix the rule, or add a reasoned entry to tests/fuzz/known-failures.json)").toBe("");

    // The oracles must have had something to compare, or a green run proves nothing.
    expect(result.stats.oxlintRules).toBeGreaterThan(50);
    expect(result.stats.oxlintFiles).toBeGreaterThan(500);
    expect(result.stats.templateFiles).toBeGreaterThan(100);
    expect(result.stats.fsTrees).toBeGreaterThan(10);
    expect(result.stats.comparisons).toBeGreaterThan(500);
    expect(result.stats.comparedFindings).toBeGreaterThan(100);
    expect(result.stats.skippedUnparsable).toBeLessThan(result.stats.comparisons / 10);
  }, 120_000);

  it("is deterministic for a seed", async () => {
    const options = { ...SMOKE_OPTIONS, engines: ["oxlint" as const], stressScale: 0.02 };
    const first = await runFuzz(options);
    const second = await runFuzz(options);
    // Timings are not deterministic; what the rules do with the inputs is.
    const stable = (failures: Failure[]): string[][] =>
      failures.filter((item) => item.oracle !== "slowness").map((item) => [item.oracle, item.rule, item.input, item.variant]);
    expect(stable(second.failures)).toEqual(stable(first.failures));
    expect(second.stats.oxlintFiles).toBe(first.stats.oxlintFiles);
  }, 120_000);
});
