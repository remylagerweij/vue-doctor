import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveOptedInRules } from "../src/config/rule-options.js";
import { computeCacheContexts } from "../src/core/cache-keys.js";
import { createOxlintConfig, getCanonicalRuleId, OXLINT_RULES, RULE_REGISTRY } from "../src/plugin/registry.js";
import type { ProjectInfo } from "../src/types.js";

// Rules that are off by default (opt-in previews, see the 2.5.0 release plan) must be switchable on
// from the project config, through every layer: config -> oxlint config -> findings -> report.

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const CLEAN_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "clean-vue");

const RULE_ID = "vue-doctor/reactivity/no-unowned-watcher";
const FLAT_RULE = "no-unowned-watcher";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const createProject = (config?: Record<string, unknown>): string => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-preview-")));
  temporaryDirectories.push(directory);
  fs.cpSync(CLEAN_VUE_DIRECTORY, directory, { recursive: true });
  fs.mkdirSync(path.join(directory, "composables"));
  fs.writeFileSync(
    path.join(directory, "composables", "useSearch.ts"),
    `import { watch } from "vue";\n\nexport async function useSearch(query: { value: string }) {\n  await loadIndex();\n  watch(query, run);\n}\n\ndeclare function loadIndex(): Promise<void>;\ndeclare function run(): void;\n`,
  );
  if (config) fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify(config));
  return directory;
};

interface ReportFinding {
  ruleId: string;
  severity: string;
  file: string;
  line: number;
}

const scan = (directory: string, extraArgs: string[] = ["--no-cache"]): ReportFinding[] => {
  const result = spawnSync(process.execPath, [CLI_PATH, directory, "-y", "--json", "--no-dead-code", "--offline", ...extraArgs], {
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout).projects[0].findings as ReportFinding[];
};

const previewFindings = (findings: ReportFinding[]): ReportFinding[] => findings.filter((finding) => finding.ruleId === RULE_ID);

describe("opt-in preview rules", () => {
  it("are registered off by default", () => {
    const meta = RULE_REGISTRY.find((candidate) => candidate.id === FLAT_RULE);
    expect(meta?.defaultSeverity).toBe("off");
    const config = createOxlintConfig({ pluginPath: "plugin.js", framework: "nuxt" });
    expect(Object.keys(config.rules)).not.toContain(`vue-doctor/${FLAT_RULE}`);
  });

  it("are enabled in the oxlint config when opted in", () => {
    const config = createOxlintConfig({ pluginPath: "plugin.js", framework: "vite", optedInRules: new Set([FLAT_RULE]) });
    expect(config.rules[`vue-doctor/${FLAT_RULE}`]).toBe("warn");
  });

  it("are opted in only by a key that names the rule; a later off wins", () => {
    expect([...resolveOptedInRules({ rules: { [RULE_ID]: "warn" } })]).toEqual([FLAT_RULE]);
    expect([...resolveOptedInRules({ rules: { [RULE_ID]: ["error", {}] } })]).toEqual([FLAT_RULE]);
    expect([...resolveOptedInRules({ rules: { "vue-doctor/reactivity/*": "error" } })]).toEqual([]);
    expect([...resolveOptedInRules({ rules: { [RULE_ID]: "warn", "vue-doctor/reactivity/*": "off" } })]).toEqual([]);
    expect([...resolveOptedInRules({ rules: { [RULE_ID]: "off" } })]).toEqual([]);
    expect([...resolveOptedInRules(null)]).toEqual([]);
  });

  it("every preview rule can be opted in by its canonical ID", () => {
    const previews = OXLINT_RULES.map((rule) => rule.ruleMeta).filter((meta) => meta.defaultSeverity === "off");
    const config = { rules: Object.fromEntries(previews.map((meta) => [getCanonicalRuleId(meta), "warn" as const])) };
    expect([...resolveOptedInRules(config)].sort()).toEqual(previews.map((meta) => meta.id).sort());
  });

  it("change the lint cache key when opted in", () => {
    const directory = createProject();
    const project = { framework: "vite", hasTypeScript: false } as ProjectInfo;
    const before = computeCacheContexts(directory, project);
    const after = computeCacheContexts(directory, project, undefined, undefined, undefined, new Set([FLAT_RULE]));
    expect(after.lint).not.toBe(before.lint);
  });
});

describe("opt-in preview rules through the built CLI", () => {
  it("report nothing without a config entry", () => {
    expect(previewFindings(scan(createProject()))).toEqual([]);
  });

  it("report findings at the configured severity once the config enables the rule", () => {
    const warned = previewFindings(scan(createProject({ rules: { [RULE_ID]: "warn" } })));
    expect(warned).toEqual([expect.objectContaining({ file: "composables/useSearch.ts", line: 5, severity: "warning" })]);

    const errored = previewFindings(scan(createProject({ rules: { [RULE_ID]: "error" } })));
    expect(errored).toEqual([expect.objectContaining({ severity: "error" })]);
  });

  it("are not enabled by a group key", () => {
    expect(previewFindings(scan(createProject({ rules: { "vue-doctor/reactivity/*": "warn" } })))).toEqual([]);
  });

  it("re-analyze cached files when the config opts a rule in", () => {
    const directory = createProject();
    expect(previewFindings(scan(directory, []))).toEqual([]);
    fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify({ rules: { [RULE_ID]: "warn" } }));
    expect(previewFindings(scan(directory, []))).toHaveLength(1);
  });
});
