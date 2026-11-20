import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveOptInRules } from "../src/config/opt-in-rules.js";
import type { VueDoctorConfig } from "../src/config/schema.js";
import { RULE_REGISTRY, createCustomTemplateRuleConfig, createOxlintConfig, getCanonicalRuleId } from "../src/plugin/registry.js";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");

const IMG_ALT = "vue-doctor/accessibility/require-img-alt";
const OPT_IN_IDS = RULE_REGISTRY.filter((meta) => meta.defaultSeverity === "off").map((meta) => meta.id);

describe("resolveOptInRules", () => {
  const resolve = (config: VueDoctorConfig | null) => [...resolveOptInRules(config)].sort();

  it("enables nothing without config", () => {
    expect(resolve(null)).toEqual([]);
    expect(resolve({})).toEqual([]);
  });

  it("enables a single opt-in rule by its canonical ID", () => {
    expect(resolve({ rules: { [IMG_ALT]: "warn" } })).toEqual(["require-img-alt"]);
    expect(resolve({ rules: { [IMG_ALT]: ["error"] } })).toEqual(["require-img-alt"]);
  });

  it("enables a whole category through a group key, and the last matching key wins", () => {
    const accessibility = RULE_REGISTRY.filter((meta) => meta.category === "Accessibility").map((meta) => meta.id).sort();
    expect(accessibility.length).toBeGreaterThan(0);
    expect(resolve({ rules: { "vue-doctor/accessibility/*": "warn" } })).toEqual(accessibility);
    expect(resolve({ rules: { "vue-doctor/accessibility/*": "warn", [IMG_ALT]: "off" } })).toEqual(
      accessibility.filter((id) => id !== "require-img-alt"),
    );
    expect(resolve({ rules: { [IMG_ALT]: "warn", "vue-doctor/accessibility/*": "off" } })).toEqual([]);
  });

  it("never enables an opt-in rule through a preset or an ignored key", () => {
    expect(resolve({ extends: ["vue-doctor/strict"] })).toEqual([]);
    expect(resolve({ extends: ["vue-doctor/recommended"] })).toEqual([]);
    expect(resolve({ rules: { [IMG_ALT]: "warn" }, ignore: { rules: [IMG_ALT] } })).toEqual([]);
  });

  it("only returns rules that are off by default", () => {
    expect(resolve({ rules: { "vue-doctor/performance/no-deep-watch": "error" } })).toEqual([]);
  });

  it("adds enabled opt-in rules to the lint and template configs, and only those", () => {
    const optInRules = resolveOptInRules({ rules: { [IMG_ALT]: "warn" } });
    const lint = createOxlintConfig({ pluginPath: "", framework: "vite", optInRules }).rules;
    expect(lint["vue-doctor/require-img-alt"]).toBe("warn");
    expect(Object.keys(createCustomTemplateRuleConfig("vite", optInRules))).toContain("vue-doctor/require-img-alt");
    for (const id of OPT_IN_IDS.filter((id) => id !== "require-img-alt")) {
      expect(lint).not.toHaveProperty(`vue-doctor/${id}`);
      expect(createCustomTemplateRuleConfig("vite", optInRules)).not.toHaveProperty(`vue-doctor/${id}`);
    }
  });
});

describe("opt-in rules through the built CLI", () => {
  const directories: string[] = [];
  afterAll(() => {
    for (const directory of directories) fs.rmSync(directory, { recursive: true, force: true });
  });

  const makeProject = (config?: VueDoctorConfig): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-opt-in-"));
    directories.push(directory);
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "opt-in", dependencies: { vue: "^3.5.0" } }));
    fs.mkdirSync(path.join(directory, "src"));
    fs.writeFileSync(
      path.join(directory, "src", "Hero.vue"),
      `<template>\n  <section>\n    <img src="/hero.png">\n    <img src="/logo.png" alt="Acme">\n  </section>\n</template>\n`,
    );
    if (config) fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify(config));
    return directory;
  };

  const findingsOf = (directory: string) => {
    const result = spawnSync(process.execPath, [CLI_PATH, directory, "-y", "--json", "--no-dead-code", "--offline"], {
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });
    expect(result.status, result.stderr).toBe(0);
    const { projects } = JSON.parse(result.stdout) as {
      projects: { findings: { ruleId: string; severity: string; file: string; line: number }[] }[];
    };
    return projects.flatMap((project) => project.findings).filter((finding) => finding.ruleId === IMG_ALT);
  };

  it("does not run an off-by-default rule", () => {
    expect(findingsOf(makeProject())).toEqual([]);
  }, 120_000);

  it("runs it when the config enables it, at the configured severity", () => {
    const warn = findingsOf(makeProject({ rules: { [IMG_ALT]: "warn" } }));
    expect(warn.map(({ file, line, severity }) => ({ file, line, severity }))).toEqual([
      { file: "src/Hero.vue", line: 3, severity: "warning" },
    ]);
    const error = findingsOf(makeProject({ rules: { "vue-doctor/accessibility/*": "error" } }));
    expect(error.map((finding) => finding.severity)).toEqual(["error"]);
  }, 120_000);

  it("re-analyses cached files when the config opts in", () => {
    const directory = makeProject();
    expect(findingsOf(directory)).toEqual([]);
    fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify({ rules: { [IMG_ALT]: "warn" } }));
    expect(findingsOf(directory)).toHaveLength(1);
  }, 120_000);

  it("uses canonical IDs for every opt-in rule", () => {
    for (const meta of RULE_REGISTRY.filter((candidate) => candidate.defaultSeverity === "off")) {
      expect(getCanonicalRuleId(meta)).toMatch(/^vue-doctor\/[a-z-]+\/[a-z-]+$/);
    }
  });
});
