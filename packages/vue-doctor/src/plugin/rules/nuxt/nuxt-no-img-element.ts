import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "nuxt-no-img-element",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `<NuxtImg>` from `@nuxt/image` — provides automatic optimization, lazy loading, and responsive images",
    agentGuidance: "Replace `<img>` with `<NuxtImg>` (or `<NuxtPicture>`) from `@nuxt/image`; keep the same `src`, `alt`, width and height.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "h" &&
        node.arguments?.[0]?.type === "Literal" &&
        node.arguments[0].value === "img"
      ) {
        context.report({
          node,
          message: 'Using <img> in Nuxt — use <NuxtImg> from @nuxt/image for automatic optimization',
        });
      }
    },
  }),
});
