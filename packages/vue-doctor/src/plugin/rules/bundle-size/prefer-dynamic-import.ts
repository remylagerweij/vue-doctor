import { HEAVY_LIBRARIES } from "../../constants.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "prefer-dynamic-import",
    category: "Bundle Size",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `defineAsyncComponent(() => import('./HeavyComponent.vue'))` for heavy components",
    agentGuidance: "Load heavy libraries or components lazily: `defineAsyncComponent(() => import('./Heavy.vue'))` for components, `await import('lib')` where the code is first needed.",
  },
  create: (context: RuleContext) => ({
    ImportDeclaration(node: EsTreeNode) {
      const source = node.source?.value;
      if (typeof source !== "string") return;

      if (HEAVY_LIBRARIES.has(source)) {
        context.report({
          node,
          message: `Static import of heavy library "${source}" — use defineAsyncComponent(() => import('${source}')) to lazy load`,
        });
      }
    },
  }),
});
