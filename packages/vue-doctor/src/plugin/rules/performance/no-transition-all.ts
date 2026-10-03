import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const WHOLE_WORD_ALL = /\ball\b/;

export default defineRule({
  meta: {
    id: "no-transition-all",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "List specific properties: `transition: \"opacity 200ms, transform 200ms\"` — or in Tailwind use `transition-colors`, `transition-opacity`, or `transition-transform`",
    agentGuidance: "Replace `transition: all` with an explicit property list, for example `transition: opacity 200ms, transform 200ms`, naming only the properties that actually change.",
  },
  create: (context: RuleContext) => ({
    Property(node: EsTreeNode) {
      if (node.key?.type !== "Identifier") return;

      if (
        (node.key.name === "transition" || node.key.name === "transitionProperty") &&
        node.value?.type === "Literal" &&
        typeof node.value.value === "string" &&
        // Whole word only: `small-fade` or `overall` must not count as `all`.
        WHOLE_WORD_ALL.test(node.value.value)
      ) {
        context.report({
          node,
          message: 'transition: "all" animates every CSS property — list specific properties instead',
        });
      }
    },

    Literal(node: EsTreeNode) {
      if (typeof node.value !== "string") return;
      if (node.value.includes("transition-all") || node.value.includes("transition: all")) {
        context.report({
          node,
          message: 'transition-all animates every CSS property — use transition-colors, transition-opacity, or transition-transform',
        });
      }
    },
  }),
});
