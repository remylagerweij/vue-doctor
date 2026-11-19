import type { PluginConfig, Rule, RulePlugin } from "./types.js";
import { OXLINT_RULES, PLUGIN_NAME, createNuxtRules, createRecommendedRules } from "./registry.js";
import { SETTINGS_KEY } from "./nuxt-files.js";

// The rules map is derived from the registry, which is built from the files under rules/.
// Hosts only see the ESLint-compatible `meta` and `create`; registry metadata stays internal.
const rules: Record<string, Rule> = {};
for (const { meta, create, ruleMeta } of OXLINT_RULES) {
  rules[ruleMeta.id] = { meta, create };
}

const plugin: RulePlugin = {
  meta: {
    name: PLUGIN_NAME,
  },
  rules,
  // Filled below: the presets point back at the plugin object itself.
  configs: {} as RulePlugin["configs"],
};

const createConfig = (name: string, presetRules: PluginConfig["rules"], framework?: string): PluginConfig => ({
  name,
  plugins: { [PLUGIN_NAME]: plugin },
  rules: presetRules,
  ...(framework ? { settings: { [SETTINGS_KEY]: { framework } } } : {}),
});

plugin.configs = {
  recommended: createConfig(`${PLUGIN_NAME}/recommended`, createRecommendedRules()),
  nuxt: createConfig(`${PLUGIN_NAME}/nuxt`, createNuxtRules(), "nuxt"),
};

export default plugin;
