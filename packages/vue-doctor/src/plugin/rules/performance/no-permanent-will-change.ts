import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-permanent-will-change",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Add will-change on animation start and remove on end. Permanent promotion wastes GPU memory",
    agentGuidance: "Remove the static `will-change`. Apply it just before the animation starts (for example on hover or via a class added in JS) and remove it when the animation ends.",
  },
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (
        node.key?.type === "Identifier" &&
        node.key.name === "willChange" &&
        node.value?.type === "Literal" &&
        typeof node.value.value === "string" &&
        node.value.value !== "auto"
      ) {
        context.report({
          node,
          message: "Permanent will-change wastes GPU memory — add on animation start and remove on end",
        });
      }
    },
  }),
});
