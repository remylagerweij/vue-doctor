import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "nuxt-no-a-element",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `<NuxtLink>` — enables client-side navigation and prefetching",
    agentGuidance: "Replace internal `<a href>` links with `<NuxtLink to=\"...\">`; keep plain `<a>` only for external URLs.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "h" &&
        node.arguments?.[0]?.type === "Literal" &&
        node.arguments[0].value === "a"
      ) {
        context.report({
          node,
          message: 'Using <a> in Nuxt — use <NuxtLink> for client-side navigation and prefetching',
        });
      }
    },
  }),
});
