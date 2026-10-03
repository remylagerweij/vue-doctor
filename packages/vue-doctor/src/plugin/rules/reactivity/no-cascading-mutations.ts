import { CASCADING_MUTATION_THRESHOLD, WATCH_FUNCTIONS } from "../../constants.js";
import { analyzeWatchCallback, getWatchCallback, getWatchEffectCallback, isSpecificCall } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-cascading-mutations",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Combine related state into a single reactive object or use a composable to manage state transitions",
    agentGuidance: "Several state mutations in one watcher usually mean the state is split wrongly. Group the related refs into one reactive object or move the transition into a composable function, then update it in a single place.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, WATCH_FUNCTIONS)) return;

      const isWatchEffect = node.callee.name !== "watch";
      const callback = isWatchEffect ? getWatchEffectCallback(node) : getWatchCallback(node);
      if (!callback) return;

      const { mutationCount } = analyzeWatchCallback(callback);
      if (mutationCount >= CASCADING_MUTATION_THRESHOLD) {
        context.report({
          node,
          message: `${mutationCount} reactive mutations in a single ${node.callee.name} — consider using a composable or combining state`,
        });
      }
    },
  }),
});
