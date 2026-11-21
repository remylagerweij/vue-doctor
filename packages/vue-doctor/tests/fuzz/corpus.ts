import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
// @ts-expect-error plain .mjs build script without type declarations
import { listRuleFiles } from "../../scripts/generate-rules.mjs";
import type { FsRuleCases } from "../../src/plugin/fs-rule-cases.js";
import { FS_RULES, OXLINT_RULES } from "../../src/plugin/registry.js";
import type { RuleCases } from "../../src/plugin/rule-cases.js";
import templateCases from "../../src/plugin/template-rules.cases.js";
import type { Random } from "./prng.js";
import type { SourceInput, TreeInput } from "./types.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "../..");
const RULES_DIRECTORY = path.join(PACKAGE_DIRECTORY, "src/plugin/rules");
const FIXTURES_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests/fixtures");
const BENCHMARKS_DIRECTORY = path.resolve(PACKAGE_DIRECTORY, "../../benchmarks");

export const DEFAULT_CASE_FILENAME = "src/example.ts";

const ruleFiles = listRuleFiles() as string[];

const loadCasesFile = async <Cases>(ruleId: string): Promise<Cases | undefined> => {
  const ruleFile = ruleFiles.find((file) => path.basename(file, ".ts") === ruleId);
  if (!ruleFile) return undefined;
  const casesFile = path.join(RULES_DIRECTORY, ruleFile.replace(/\.ts$/, ".cases.ts"));
  if (!fs.existsSync(casesFile)) return undefined;
  return ((await import(pathToFileURL(casesFile).href)) as { default: Cases }).default;
};

/** Every valid and invalid case of every own oxlint rule, plus the template cases they declare. */
export const loadScriptRuleInputs = async (): Promise<SourceInput[]> => {
  const inputs: SourceInput[] = [];
  for (const rule of OXLINT_RULES) {
    const ruleId = rule.ruleMeta.id;
    const cases = await loadCasesFile<RuleCases>(ruleId);
    if (!cases) continue;
    for (const kind of ["valid", "invalid"] as const) {
      for (const testCase of cases[kind]) {
        inputs.push({
          id: `case:${ruleId}:${kind}:${testCase.name}`,
          origin: "cases",
          filename: testCase.filename ?? DEFAULT_CASE_FILENAME,
          code: testCase.code,
          owner: ruleId,
          ruleOptions: testCase.options,
        });
      }
      for (const testCase of cases.template?.[kind] ?? []) {
        inputs.push({
          id: `case:${ruleId}:template-${kind}:${testCase.name}`,
          origin: "cases",
          filename: testCase.filename ?? "Comp.vue",
          code: testCase.code,
          owner: ruleId,
        });
      }
    }
  }
  return inputs;
};

/** The cases of the eslint-plugin-vue template rules (`template-rules.cases.ts`). */
export const loadTemplateRuleInputs = (): SourceInput[] => {
  const inputs: SourceInput[] = [];
  for (const [ruleId, cases] of Object.entries(templateCases)) {
    for (const kind of ["valid", "invalid"] as const) {
      for (const testCase of cases[kind]) {
        inputs.push({
          id: `template-case:${ruleId}:${kind}:${testCase.name}`,
          origin: "template-cases",
          filename: testCase.filename ?? "Comp.vue",
          code: testCase.code,
          owner: ruleId,
          engines: ["template", "oxlint"],
        });
      }
    }
  }
  return inputs;
};

/** The virtual file trees of every filesystem rule's cases. */
export const loadFsRuleTrees = async (): Promise<TreeInput[]> => {
  const trees: TreeInput[] = [];
  for (const rule of FS_RULES) {
    const ruleId = rule.ruleMeta.id;
    const cases = await loadCasesFile<FsRuleCases>(ruleId);
    if (!cases) continue;
    for (const kind of ["valid", "invalid"] as const) {
      for (const testCase of cases[kind]) {
        trees.push({
          id: `fs-case:${ruleId}:${kind}:${testCase.name}`,
          origin: "cases",
          files: testCase.files,
          ignored: testCase.ignored,
          untracked: testCase.untracked,
          git: testCase.git,
          framework: testCase.framework,
          owner: ruleId,
        });
      }
    }
  }
  return trees;
};

const SOURCE_FILE_PATTERN = /\.(?:vue|[cm]?[jt]sx?)$/;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".nuxt", ".output", "dist", "coverage", ".vitepress"]);

const walk = (directory: string, visit: (file: string) => void): void => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path.join(directory, entry.name), visit);
    } else if (entry.isFile()) {
      visit(path.join(directory, entry.name));
    }
  }
};

const toForwardSlashes = (relative: string): string => relative.split(path.sep).join("/");

const listFixtures = (): string[] =>
  fs
    .readdirSync(FIXTURES_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "osv")
    .map((entry) => entry.name)
    .sort();

/** Every `.vue`/`.ts`/`.js` file of the test fixture projects. */
export const loadFixtureInputs = (): SourceInput[] => {
  const inputs: SourceInput[] = [];
  for (const fixture of listFixtures()) {
    const root = path.join(FIXTURES_DIRECTORY, fixture);
    const files: string[] = [];
    walk(root, (file) => SOURCE_FILE_PATTERN.test(file) && files.push(file));
    for (const file of files.sort()) {
      const relative = toForwardSlashes(path.relative(root, file));
      inputs.push({ id: `fixture:${fixture}/${relative}`, origin: "fixture", filename: relative, code: fs.readFileSync(file, "utf8") });
    }
  }
  return inputs;
};

const TEXT_FILE_LIMIT_BYTES = 200_000;

/** Each fixture project as a virtual tree for the filesystem rules (all small text files). */
export const loadFixtureTrees = (): TreeInput[] =>
  listFixtures().map((fixture) => {
    const root = path.join(FIXTURES_DIRECTORY, fixture);
    const files: Record<string, string> = {};
    walk(root, (file) => {
      if (fs.statSync(file).size > TEXT_FILE_LIMIT_BYTES) return;
      files[toForwardSlashes(path.relative(root, file))] = fs.readFileSync(file, "utf8");
    });
    return { id: `fixture-tree:${fixture}`, origin: "fixture", files, framework: fixture === "nuxt-app" ? "nuxt" : "vite" };
  });

export interface BenchmarkCorpus {
  inputs: SourceInput[];
  /** Cached repositories that were found, for the report. */
  repositories: string[];
}

/**
 * Source files of the pinned benchmark repositories, when they are already cached locally (see
 * benchmarks/README.md). Nothing is ever fetched: without a cache this returns nothing. A
 * deterministic sample of at most `limit` files is returned.
 */
export const loadBenchmarkInputs = (random: Random, limit: number): BenchmarkCorpus => {
  const cacheDirectory = path.resolve(process.env.BENCHMARK_DIR || path.join(os.tmpdir(), "vue-doctor-benchmark"));
  const found: SourceInput[] = [];
  const repositories: string[] = [];
  let repos: { id: string; sha: string }[] = [];
  try {
    repos = (JSON.parse(fs.readFileSync(path.join(BENCHMARKS_DIRECTORY, "repos.json"), "utf8")) as { repos: { id: string; sha: string }[] }).repos;
  } catch {
    return { inputs: [], repositories };
  }
  for (const repo of repos) {
    const root = path.join(cacheDirectory, `${repo.id}-${repo.sha.slice(0, 8)}`);
    if (!fs.existsSync(path.join(root, ".git"))) continue;
    repositories.push(repo.id);
    walk(root, (file) => {
      if (!SOURCE_FILE_PATTERN.test(file) || file.endsWith(".d.ts")) return;
      if (fs.statSync(file).size > 100_000) return;
      const relative = toForwardSlashes(path.relative(root, file));
      found.push({ id: `benchmark:${repo.id}/${relative}`, origin: "benchmark", filename: relative, code: fs.readFileSync(file, "utf8") });
    });
  }
  found.sort((a, b) => a.id.localeCompare(b.id));
  // Fisher-Yates with the seeded generator, so the same seed samples the same files.
  for (let index = found.length - 1; index > 0; index--) {
    const other = random.int(index + 1);
    [found[index], found[other]] = [found[other], found[index]];
  }
  return { inputs: found.slice(0, limit), repositories };
};
