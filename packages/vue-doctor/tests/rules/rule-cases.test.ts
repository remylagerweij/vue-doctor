import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script without type declarations
import { listRuleFiles } from "../../scripts/generate-rules.mjs";
import type { FsRuleCases } from "../../src/plugin/fs-rule-cases.js";
import type { RuleCases } from "../../src/plugin/rule-cases.js";
import { FS_RULES, OXLINT_RULES, RULE_REGISTRY } from "../../src/plugin/registry.js";
import templateCases from "../../src/plugin/template-rules.cases.js";
import type { Diagnostic } from "../../src/types.js";
import { runEslintVue } from "../../src/utils/run-eslint-vue.js";
import { runFsRuleCase } from "../support/run-fs-rule-cases.js";
import { DEFAULT_CASE_FILENAME, runOxlintOnFiles, type FileResult } from "../support/run-rule-cases.js";

// Each rule ships `<id>.cases.ts` next to its implementation. Every case runs through the same
// engine as production (oxlint + the built plugin), so a rule cannot pass here yet misbehave there.
const MIN_CASES_PER_KIND = 3;
const RULES_DIRECTORY = path.resolve(import.meta.dirname, "../../src/plugin/rules");

interface LoadedRule {
  id: string;
  cases: RuleCases;
}

const casesFileFor = (ruleFile: string): string =>
  path.join(RULES_DIRECTORY, ruleFile.replace(/\.ts$/, ".cases.ts"));

const ruleFiles = listRuleFiles() as string[];

const loadCases = async <Cases>(ruleId: string): Promise<Cases | undefined> => {
  const ruleFile = ruleFiles.find((file) => path.basename(file, ".ts") === ruleId);
  if (!ruleFile || !fs.existsSync(casesFileFor(ruleFile))) return undefined;
  return ((await import(pathToFileURL(casesFileFor(ruleFile)).href)) as { default: Cases }).default;
};

const loadedRules: LoadedRule[] = [];
for (const rule of OXLINT_RULES) {
  const cases = await loadCases<RuleCases>(rule.ruleMeta.id);
  if (cases) loadedRules.push({ id: rule.ruleMeta.id, cases });
}

// Filesystem rules (engine "fs") have the same guards but their cases are virtual file trees.
interface LoadedFsRule {
  id: string;
  cases: FsRuleCases;
}

const loadedFsRules: LoadedFsRule[] = [];
for (const rule of FS_RULES) {
  const cases = await loadCases<FsRuleCases>(rule.ruleMeta.id);
  if (cases) loadedFsRules.push({ id: rule.ruleMeta.id, cases });
}

describe("rule cases coverage", () => {
  it("has a cases file for every registered rule", () => {
    const missing = [...OXLINT_RULES, ...FS_RULES]
      .map((rule) => rule.ruleMeta.id)
      .filter((id) => ![...loadedRules, ...loadedFsRules].some((rule) => rule.id === id));
    expect(missing, `rules without a <rule-id>.cases.ts next to them: ${missing.join(", ")}`).toEqual([]);
  });

  it(`has at least ${MIN_CASES_PER_KIND} valid and ${MIN_CASES_PER_KIND} invalid cases per rule`, () => {
    const lacking = [...loadedRules, ...loadedFsRules]
      .filter(
        ({ cases }) => cases.valid.length < MIN_CASES_PER_KIND || cases.invalid.length < MIN_CASES_PER_KIND,
      )
      .map(({ id, cases }) => `${id} (${cases.valid.length} valid, ${cases.invalid.length} invalid)`);
    expect(lacking, `rules with too few cases: ${lacking.join(", ")}`).toEqual([]);
  });

  it("names every case and keeps names unique within a rule", () => {
    for (const { id, cases } of [...loadedRules, ...loadedFsRules]) {
      const names = [...cases.valid, ...cases.invalid].map((testCase) => testCase.name);
      expect(names.every((name) => name.trim() !== ""), `${id} has an unnamed case`).toBe(true);
      expect(new Set(names).size, `${id} has duplicate case names`).toBe(names.length);
    }
  });

  it("has no cases file without a registered rule", () => {
    const registered = new Set([...OXLINT_RULES, ...FS_RULES].map((rule) => rule.ruleMeta.id));
    const orphans = ruleFiles
      .filter((file) => fs.existsSync(casesFileFor(file)))
      .map((file) => path.basename(file, ".ts"))
      .filter((id) => !registered.has(id));
    expect(orphans).toEqual([]);
  });
});

interface Job {
  ruleId: string;
  kind: "valid" | "invalid";
  index: number;
  filename: string;
  code: string;
}

const jobs: Job[] = loadedRules.flatMap(({ id, cases }) => [
  ...cases.valid.map((testCase, index) => ({
    ruleId: id,
    kind: "valid" as const,
    index,
    filename: testCase.filename ?? DEFAULT_CASE_FILENAME,
    code: testCase.code,
  })),
  ...cases.invalid.map((testCase, index) => ({
    ruleId: id,
    kind: "invalid" as const,
    index,
    filename: testCase.filename ?? DEFAULT_CASE_FILENAME,
    code: testCase.code,
  })),
]);

describe("rule cases (oxlint + built plugin)", () => {
  let results: FileResult[] = [];

  // One oxlint run for all cases of all rules keeps the whole suite to a few seconds.
  beforeAll(async () => {
    results = await runOxlintOnFiles(jobs.map(({ filename, code }) => ({ filename, code })));
  }, 120_000);

  for (const { id, cases } of loadedRules) {
    describe(id, () => {
      const resultFor = (kind: Job["kind"], index: number): FileResult =>
        results[jobs.findIndex((job) => job.ruleId === id && job.kind === kind && job.index === index)];

      cases.valid.forEach((testCase, index) => {
        it(`valid: ${testCase.name}`, () => {
          const result = resultFor("valid", index);
          expect(result.problems, "snippet must parse cleanly").toEqual([]);
          expect(result.findings.filter((finding) => finding.rule === id)).toEqual([]);
        });
      });

      cases.invalid.forEach((testCase, index) => {
        it(`invalid: ${testCase.name}`, () => {
          const result = resultFor("invalid", index);
          expect(result.problems, "snippet must parse cleanly").toEqual([]);
          expect(result.findings.filter((finding) => finding.rule === id)).toHaveLength(
            testCase.count ?? 1,
          );
        });
      });
    });
  }
});

describe("fs rule cases (virtual file trees)", () => {
  for (const { id, cases } of loadedFsRules) {
    const rule = FS_RULES.find((candidate) => candidate.ruleMeta.id === id)!;
    describe(id, () => {
      cases.valid.forEach((testCase) => {
        it(`valid: ${testCase.name}`, () => {
          expect(runFsRuleCase(rule, testCase)).toEqual([]);
        });
      });

      cases.invalid.forEach((testCase) => {
        it(`invalid: ${testCase.name}`, () => {
          const found = runFsRuleCase(rule, testCase);
          expect(found.map(({ filePath, line }) => ({ file: filePath, line }))).toEqual(
            testCase.findings.map(({ file, line }, index) => ({ file, line: line ?? found[index]?.line })),
          );
        });
      });

      it("never puts a file's values into a message", () => {
        for (const testCase of cases.invalid) {
          const messages = runFsRuleCase(rule, testCase).map((finding) => finding.message);
          for (const content of Object.values(testCase.files)) {
            for (const value of content.matchAll(/=\s*["']?([^\s"'#]{6,})/g)) {
              expect(messages.join("\n")).not.toContain(value[1]);
            }
          }
        }
      });
    });
  }
});

// eslint-plugin-vue rules are upstream code, so they get a lighter check than Vue Doctor's own
// rules: one invalid snippet each must be reported and one valid near-miss must stay silent.
const templateRuleIds = RULE_REGISTRY.filter((meta) => meta.engine === "eslint-template").map(
  (meta) => meta.id,
);

describe("template rule cases (eslint-plugin-vue)", () => {
  it("has valid and invalid cases for every registered template rule", () => {
    const missing = templateRuleIds.filter((id) => {
      const cases = templateCases[id];
      return !cases || cases.valid.length < 1 || cases.invalid.length < 1;
    });
    expect(missing, `template rules without cases: ${missing.join(", ")}`).toEqual([]);
    expect(Object.keys(templateCases).filter((id) => !templateRuleIds.includes(id))).toEqual([]);
  });

  describe("runs through the production runner", () => {
    let diagnostics: Diagnostic[] = [];
    let projectDirectory = "";
    const fileFor = (ruleId: string, kind: "valid" | "invalid", index: number): string =>
      `${ruleId.replace("/", "-")}/${kind}-${index}/${templateCases[ruleId][kind][index].filename ?? "Comp.vue"}`;

    beforeAll(async () => {
      projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-cases-"));
      for (const id of templateRuleIds) {
        for (const kind of ["valid", "invalid"] as const) {
          templateCases[id][kind].forEach((testCase, index) => {
            const target = path.join(projectDirectory, fileFor(id, kind, index));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, testCase.code);
          });
        }
      }
      diagnostics = await runEslintVue(projectDirectory);
    }, 120_000);

    afterAll(() => fs.rmSync(projectDirectory, { recursive: true, force: true }));

    for (const id of templateRuleIds) {
      describe(id, () => {
        const reportsIn = (kind: "valid" | "invalid", index: number): number =>
          diagnostics.filter(
            (diagnostic) => diagnostic.rule === id && diagnostic.filePath === fileFor(id, kind, index),
          ).length;

        templateCases[id].valid.forEach((testCase, index) =>
          it(`valid: ${testCase.name}`, () => expect(reportsIn("valid", index)).toBe(0)),
        );
        templateCases[id].invalid.forEach((testCase, index) =>
          it(`invalid: ${testCase.name}`, () => expect(reportsIn("invalid", index)).toBeGreaterThan(0)),
        );
      });
    }
  });
});

// Own rules that also run on templates (custom ESLint template rules sharing the oxlint rule's ID)
// declare those cases under `template`; they run through the same production runner.
const templateCaseRules = loadedRules.filter(({ cases }) => cases.template);

describe("template cases of own rules", () => {
  let diagnostics: Diagnostic[] = [];
  let projectDirectory = "";
  const fileFor = (ruleId: string, kind: "valid" | "invalid", index: number, filename?: string): string =>
    `${ruleId}/${kind}-${index}/${filename ?? "Comp.vue"}`;

  beforeAll(async () => {
    projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-own-template-"));
    for (const { id, cases } of templateCaseRules) {
      for (const kind of ["valid", "invalid"] as const) {
        cases.template![kind].forEach((testCase, index) => {
          const target = path.join(projectDirectory, fileFor(id, kind, index, testCase.filename));
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, testCase.code);
        });
      }
    }
    diagnostics = await runEslintVue(projectDirectory);
  }, 120_000);

  afterAll(() => fs.rmSync(projectDirectory, { recursive: true, force: true }));

  for (const { id, cases } of templateCaseRules) {
    describe(id, () => {
      const reportsIn = (kind: "valid" | "invalid", index: number, filename?: string): number =>
        diagnostics.filter(
          (diagnostic) =>
            diagnostic.plugin === "vue-doctor" &&
            diagnostic.rule.endsWith(`/${id}`) &&
            diagnostic.filePath === fileFor(id, kind, index, filename),
        ).length;

      it(`has at least ${MIN_CASES_PER_KIND} valid and ${MIN_CASES_PER_KIND} invalid cases`, () => {
        expect(cases.template!.valid.length).toBeGreaterThanOrEqual(MIN_CASES_PER_KIND);
        expect(cases.template!.invalid.length).toBeGreaterThanOrEqual(MIN_CASES_PER_KIND);
      });

      cases.template!.valid.forEach((testCase, index) =>
        it(`valid: ${testCase.name}`, () => expect(reportsIn("valid", index, testCase.filename)).toBe(0)),
      );
      cases.template!.invalid.forEach((testCase, index) =>
        it(`invalid: ${testCase.name}`, () =>
          expect(reportsIn("invalid", index, testCase.filename)).toBe(testCase.count ?? 1)),
      );
    });
  }
});
