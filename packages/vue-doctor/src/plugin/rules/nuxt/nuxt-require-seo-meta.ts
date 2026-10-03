import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "nuxt-require-seo-meta",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `useSeoMeta({ title, description })` instead of passing `meta` tags to `useHead()`",
    agentGuidance: "Replace `useHead({ meta: [...] })` with `useSeoMeta({ title, description, ogTitle, ... })` for type-safe SEO tags.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "useHead"
      ) {
        const arg = node.arguments?.[0];
        if (arg?.type !== "ObjectExpression") return;

        const hasMeta = arg.properties?.some(
          (prop: EsTreeNode) =>
            prop.type === "Property" &&
            prop.key?.type === "Identifier" &&
            prop.key.name === "meta",
        );

        if (hasMeta) {
          context.report({
            node,
            message: "useHead() with meta tags — prefer useSeoMeta() for type-safe SEO meta management",
          });
        }
      }
    },
  }),
});
