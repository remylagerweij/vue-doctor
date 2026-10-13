import { isNuxtClientFile } from "../../client-bundle.js";
import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

// Bundlers and Nuxt replace this one at build time, so it is safe (and common) in client code.
const BUILD_TIME_ENV_NAMES = new Set(["NODE_ENV"]);

const getEnvName = (node: EsTreeNode): string | null => {
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.computed && node.property?.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  return null;
};

export default defineRule({
  meta: {
    id: "nuxt-no-process-env-in-client",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `useRuntimeConfig()`; expose client values through `runtimeConfig.public` in nuxt.config",
    agentGuidance:
      "Only files that end up in the client bundle are checked (components, pages, layouts, composables, non-`.server` plugins, app middleware, stores, utils, `app.vue`); `server/`, `scripts/`, `shared/` and config files run in Node and may read `process.env`. Read configuration with `useRuntimeConfig()`. Declare values in `runtimeConfig` (server-only) or `runtimeConfig.public` (client) in `nuxt.config`.",
  },
  create: (context: RuleContext): RuleVisitors => {
    if (!isNuxtClientFile(getFilename(context))) return {};

    return {
      MemberExpression(node: EsTreeNode) {
        if (
          node.object?.type === "MemberExpression" &&
          node.object.object?.type === "Identifier" &&
          node.object.object.name === "process" &&
          node.object.property?.type === "Identifier" &&
          node.object.property.name === "env" &&
          !BUILD_TIME_ENV_NAMES.has(getEnvName(node) ?? "")
        ) {
          context.report({
            node,
            message: "process.env in client-bundled Nuxt code — use useRuntimeConfig() (runtimeConfig.public for client values)",
          });
        }
      },
    };
  },
});
