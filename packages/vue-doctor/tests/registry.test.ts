import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script without type declarations
import { listRuleFiles, renderBarrel } from "../scripts/generate-rules.mjs";
import { RULE_CATEGORIES } from "../src/plugin/define-rule.js";
import plugin from "../src/plugin/index.js";
import {
  AUDIT_RULES,
  FS_RULES,
  OXLINT_RULES,
  RULE_REGISTRY,
  createOxlintConfig,
  createCustomTemplateRuleConfig,
  createTemplateRuleConfig,
  getRuleCounts,
  getCanonicalRuleId,
  getRuleMeta,
} from "../src/plugin/registry.js";
import { ruleIdOf } from "../src/plugin/rule-ids.js";
import { CUSTOM_TEMPLATE_RULES } from "../src/plugin/custom-template-rules.js";
import { runEslintVue } from "../src/utils/run-eslint-vue.js";
import { runOxlint } from "../src/utils/run-oxlint.js";

const SNAPSHOT_DIRECTORY = path.resolve(import.meta.dirname, "snapshots");
const BASIC_VUE_DIRECTORY = path.resolve(import.meta.dirname, "fixtures", "basic-vue");
const RULES_DIRECTORY = path.resolve(import.meta.dirname, "../src/plugin/rules");

const readSnapshot = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIRECTORY, name), "utf8"));

describe("rule registry", () => {
  it("has unique rule ids", () => {
    const ids = RULE_REGISTRY.map((meta) => meta.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses known categories and non-empty help and agent guidance", () => {
    for (const meta of RULE_REGISTRY) {
      expect(RULE_CATEGORIES, meta.id).toContain(meta.category);
      expect(meta.help.trim(), `${meta.id} help`).not.toBe("");
      expect(meta.agentGuidance.trim(), `${meta.id} agentGuidance`).not.toBe("");
      expect(meta.frameworks.length, `${meta.id} frameworks`).toBeGreaterThan(0);
    }
  });

  it("gives every rule in the plugin bundle metadata and the other way round", () => {
    const pluginIds = Object.keys(plugin.rules).sort();
    expect(pluginIds).toEqual(OXLINT_RULES.map((rule) => rule.ruleMeta.id).sort());
    for (const rule of OXLINT_RULES) {
      expect(rule.ruleMeta.engine).toBe("oxlint");
      expect(typeof rule.create).toBe("function");
    }
  });

  it("registers filesystem rules with a check function and keeps them out of the oxlint plugin", () => {
    expect(FS_RULES.length).toBeGreaterThan(0);
    for (const rule of FS_RULES) {
      expect(rule.ruleMeta.engine).toBe("fs");
      expect(typeof rule.check).toBe("function");
      expect(Object.keys(plugin.rules)).not.toContain(rule.ruleMeta.id);
      expect(Object.keys(createOxlintConfig({ pluginPath: "", framework: "nuxt" }).rules)).not.toContain(
        `vue-doctor/${rule.ruleMeta.id}`,
      );
    }
  });

  it("registers audit rules as metadata only, outside the oxlint plugin and the project analyzer", () => {
    expect(AUDIT_RULES.map((rule) => getCanonicalRuleId(rule.ruleMeta))).toEqual([
      "vue-doctor/supply-chain/vulnerable-dependency",
    ]);
    for (const rule of AUDIT_RULES) {
      expect(rule.ruleMeta.engine).toBe("audit");
      expect(Object.keys(plugin.rules)).not.toContain(rule.ruleMeta.id);
      expect(FS_RULES.map((fsRule) => fsRule.ruleMeta.id)).not.toContain(rule.ruleMeta.id);
      expect(Object.keys(createOxlintConfig({ pluginPath: "", framework: "nuxt" }).rules)).not.toContain(
        `vue-doctor/${rule.ruleMeta.id}`,
      );
    }
    expect(getRuleMeta("vue-doctor", "supply-chain/vulnerable-dependency")?.owasp).toBe("A06:2021");
  });

  it("registers template rules without an implementation", () => {
    const templateRules = RULE_REGISTRY.filter((meta) => meta.engine === "eslint-template");
    expect(templateRules.length).toBeGreaterThan(0);
    for (const meta of templateRules) expect(meta.id.startsWith("vue/")).toBe(true);
    expect(Object.keys(createTemplateRuleConfig())).toEqual(templateRules.map((meta) => meta.id));
  });

  it("runs a template implementation for each own rule that declares template cases", () => {
    expect(Object.keys(createCustomTemplateRuleConfig())).toEqual([
      "vue-doctor/no-unsafe-html-sink",
      "vue-doctor/no-javascript-url",
      "vue-doctor/no-user-controlled-url",
    ]);
    for (const name of Object.keys(CUSTOM_TEMPLATE_RULES)) expect(getRuleMeta("vue-doctor", name)?.engine).toBe("oxlint");
  });

  it("looks rules up by plugin and rule name", () => {
    expect(getRuleMeta("vue-doctor", "no-moment")?.category).toBe("Bundle Size");
    expect(getRuleMeta("eslint-plugin-vue", "vue/no-template-target-blank")?.category).toBe("Security");
    expect(getRuleMeta("eslint-plugin-vue", "vue/no-v-html")).toBeUndefined();
    expect(getRuleMeta("vue-doctor", "vue/no-template-target-blank")).toBeUndefined();
    // The template side of an own rule is reported under the own rule's ID and metadata.
    expect(getRuleMeta("vue-doctor", "security/no-unsafe-html-sink")).toBe(getRuleMeta("vue-doctor", "no-unsafe-html-sink"));
    expect(getRuleMeta("some-other-plugin", "no-moment")).toBeUndefined();
  });

  it("counts rules by engine and category", () => {
    const counts = getRuleCounts();
    expect(counts.registered).toBe(RULE_REGISTRY.length);
    expect(
      counts.byEngine.oxlint + counts.byEngine["eslint-template"] + counts.byEngine.fs + counts.byEngine.audit,
    ).toBe(counts.registered);
    expect(Object.values(counts.byCategory).reduce((sum, count) => sum + count, 0)).toBe(
      counts.registered,
    );
    expect(counts.enabled).toBeLessThanOrEqual(counts.registered);
  });

  it("keeps rules.total in sync with the number of enabled rules", () => {
    expect(getRuleCounts().enabled).toBe(
      RULE_REGISTRY.filter((meta) => meta.defaultSeverity !== "off").length,
    );
  });
});

describe("severity policy", () => {
  // Owner decision (2.0 analysis, decision log): error = security + correctness only.
  it("defaults to error only for high-confidence security and correctness rules", () => {
    for (const meta of RULE_REGISTRY) {
      if (meta.defaultSeverity !== "error") continue;
      expect(["Security", "Correctness"], `${meta.id} is an error but is in ${meta.category}`).toContain(
        meta.category,
      );
      expect(meta.confidence, `${meta.id} is an error but has ${meta.confidence} confidence`).toBe("high");
    }
  });

  it("ships every rule enabled", () => {
    for (const meta of RULE_REGISTRY) expect(meta.defaultSeverity, meta.id).not.toBe("off");
  });

  it("keeps the rules that reliably indicate a bug as errors", () => {
    const errors = RULE_REGISTRY.filter((meta) => meta.defaultSeverity === "error").map((meta) => meta.id);
    expect(errors.sort()).toEqual([
      "no-eval",
      "no-hardcoded-secret",
      "no-this-in-setup",
      "vue/no-dupe-keys",
      "vue/no-duplicate-attributes",
      "vue/require-v-for-key",
      "vue/return-in-computed-property",
      "vue/valid-v-bind",
      "vue/valid-v-model",
      "vue/valid-v-on",
      "vue/valid-v-slot",
    ]);
  });
});

describe("generated oxlint config", () => {
  it.each(["vite", "nuxt"] as const)("matches the pre-registry config for %s", (framework) => {
    const config = createOxlintConfig({ pluginPath: "/p/plugin.js", framework });
    expect(config).toEqual(readSnapshot(`oxlint-config-${framework}.json`));
  });

  it("never enables a rule that is off by default", () => {
    const config = createOxlintConfig({ pluginPath: "/p/plugin.js", framework: "nuxt" });
    for (const { ruleMeta } of OXLINT_RULES) {
      if (ruleMeta.defaultSeverity === "off") {
        expect(config.rules).not.toHaveProperty(`vue-doctor/${ruleMeta.id}`);
      }
    }
  });
});

describe("rule barrel", () => {
  it("is up to date (run `npm run rules:generate`)", () => {
    const barrel = fs.readFileSync(path.join(RULES_DIRECTORY, "index.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(barrel).toBe(renderBarrel());
  });

  it("matches rule files to registry ids", () => {
    const fileIds = (listRuleFiles() as string[]).map((file) => path.basename(file, ".ts")).sort();
    expect(fileIds).toEqual([...OXLINT_RULES, ...FS_RULES, ...AUDIT_RULES].map((rule) => rule.ruleMeta.id).sort());
  });

  it("places every rule in the folder of its category", () => {
    const folderOf = (category: string) => category.toLowerCase().replace(/ /g, "-");
    for (const file of listRuleFiles() as string[]) {
      const [folder, name] = file.split("/");
      const meta = getRuleMeta("vue-doctor", path.basename(name, ".ts"));
      expect(folder, file).toBe(folderOf(meta!.category));
    }
  });
});

describe("findings on basic-vue", () => {
  it("never fall back to the Other category and keep their per-rule counts", async () => {
    const [oxlint, template] = await Promise.all([
      runOxlint(BASIC_VUE_DIRECTORY, true, "vite"),
      runEslintVue(BASIC_VUE_DIRECTORY),
    ]);
    const diagnostics = [...oxlint, ...template];

    expect(diagnostics.filter((diagnostic) => diagnostic.category === "Other")).toEqual([]);

    const counts: Record<string, number> = {};
    for (const diagnostic of diagnostics) {
      const id = ruleIdOf(diagnostic);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))).toEqual(
      readSnapshot("basic-vue-rule-counts.json"),
    );
  });
});
