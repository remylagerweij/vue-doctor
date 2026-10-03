import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

// Files that run in Node, where `process.env` is the right API: Nitro code under `server/` (routes,
// middleware, plugins, utils, tasks), `nuxt.config.ts` and other `*.config.*` files, `*.server.*`
// modules and test files. Directories are matched by their Nitro sub-directory, not by name alone:
// the linter sees absolute paths, so a bare `tests/` or `modules/` could be a parent of the project.
const NODE_ONLY_FILE_PATTERN =
  /(?:^|\/)server\/(?:api|routes|middleware|plugins|utils|tasks|db|services)\/|(?:^|\/)[\w.-]+\.config\.[cm]?[jt]s$|\.(?:server|test|spec)\.[cm]?[jt]sx?$/;

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
    agentGuidance: "Read configuration with `useRuntimeConfig()`. Declare values in `runtimeConfig` (server-only) or `runtimeConfig.public` (client) in `nuxt.config`, and do not use `process.env` in app code.",
  },
  create: (context: RuleContext): RuleVisitors => {
    if (NODE_ONLY_FILE_PATTERN.test(getFilename(context))) return {};

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
            message: "process.env in Nuxt — use useRuntimeConfig() for type-safe environment variable access",
          });
        }
      },
    };
  },
});
