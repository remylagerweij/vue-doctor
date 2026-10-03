import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-scale-from-zero",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `initial={{ scale: 0.95, opacity: 0 }}` — elements should deflate like a balloon, not vanish into a point",
    agentGuidance: "Start scale animations from a value close to 1 such as 0.95 combined with opacity, instead of 0, so the element does not collapse to a point.",
  },
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (node.key?.type !== "Identifier") return;
      if (node.key.name !== "scale" && node.key.name !== "transform") return;

      if (node.value?.type === "Literal") {
        if (node.value.value === 0 || node.value.value === "scale(0)") {
          context.report({
            node,
            message: "Scaling from 0 creates a jarring pop-in effect — use scale(0.95) with opacity for a smooth entrance",
          });
        }
      }
    },
  }),
});
