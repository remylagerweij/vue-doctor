import type { Rule, RulePlugin } from "./types.js";
import { OXLINT_RULES, PLUGIN_NAME } from "./registry.js";

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
};

export default plugin;
