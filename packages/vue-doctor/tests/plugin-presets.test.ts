import { describe, expect, it } from "vitest";
import plugin from "../src/plugin/index.js";
import { OXLINT_RULES, PLUGIN_NAME, createOxlintConfig, getCapabilityGatedRules } from "../src/plugin/registry.js";

const { recommended, nuxt } = plugin.configs;

const severityOf = (severity: "error" | "warning" | "off") => (severity === "error" ? "error" : "warn");

const expectedRules = (include: (rule: (typeof OXLINT_RULES)[number]) => boolean) =>
  Object.fromEntries(
    OXLINT_RULES.filter((rule) => rule.ruleMeta.defaultSeverity !== "off" && include(rule)).map((rule) => [
      `${PLUGIN_NAME}/${rule.ruleMeta.id}`,
      severityOf(rule.ruleMeta.defaultSeverity),
    ]),
  );

describe("plugin presets", () => {
  it("recommended holds exactly the on-by-default Vue rules that need no project capability", () => {
    expect(recommended.rules).toEqual(
      expectedRules((rule) => rule.ruleMeta.frameworks.includes("vue") && !rule.ruleMeta.requires?.length),
    );
  });

  it("nuxt adds the Nuxt-only rules on top of recommended", () => {
    expect(nuxt.rules).toEqual(expectedRules((rule) => !rule.ruleMeta.requires?.length));
    expect(nuxt.rules).toMatchObject(recommended.rules);
    expect(Object.keys(nuxt.rules).length).toBeGreaterThan(Object.keys(recommended.rules).length);
    expect(nuxt.settings).toEqual({ "vue-doctor": { framework: "nuxt" } });
    expect(recommended.settings).toBeUndefined();
  });

  it("every rule is in a preset or deliberately left out because it needs a project capability", () => {
    const gated = getCapabilityGatedRules().map((rule) => rule.id);
    const covered = new Set([...Object.keys(nuxt.rules), ...gated]);
    const enabledByDefault = OXLINT_RULES.filter((rule) => rule.ruleMeta.defaultSeverity !== "off").map(
      (rule) => `${PLUGIN_NAME}/${rule.ruleMeta.id}`,
    );
    expect([...covered].sort()).toEqual([...enabledByDefault].sort());
    expect(gated.length).toBeGreaterThan(0);
  });

  it("never enables a rule the plugin does not implement, and omits rules that default to off", () => {
    for (const name of Object.keys(nuxt.rules)) {
      expect(plugin.rules).toHaveProperty(name.slice(`${PLUGIN_NAME}/`.length));
    }
    for (const { ruleMeta } of OXLINT_RULES.filter((rule) => rule.ruleMeta.defaultSeverity === "off")) {
      expect(nuxt.rules).not.toHaveProperty(`${PLUGIN_NAME}/${ruleMeta.id}`);
    }
  });

  it("matches what the CLI enables for a project without capabilities", () => {
    // The CLI config on a Nuxt project that has none of the optional capabilities.
    const cli = createOxlintConfig({ pluginPath: "plugin.js", framework: "nuxt", capabilities: new Set() });
    expect(nuxt.rules).toEqual(cli.rules);
    const vue = createOxlintConfig({ pluginPath: "plugin.js", framework: "vite", capabilities: new Set() });
    expect(recommended.rules).toEqual(vue.rules);
  });

  it("points back at the plugin so it works as an ESLint flat config object", () => {
    expect(recommended.plugins[PLUGIN_NAME]).toBe(plugin);
    expect(nuxt.plugins[PLUGIN_NAME]).toBe(plugin);
    expect(recommended.name).toBe("vue-doctor/recommended");
  });
});
