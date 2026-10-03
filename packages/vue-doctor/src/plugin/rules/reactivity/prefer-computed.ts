import { getCallbackStatements, getWatchEffectCallback, isSpecificCall } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "prefer-computed",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `const value = computed(() => expression)` instead of a watcher that only sets a ref",
    agentGuidance: "Replace the watcher that only assigns a ref with a `computed` that returns the same expression. Remove the now unused ref and its initial value.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, "watchEffect")) return;

      const callback = getWatchEffectCallback(node);
      if (!callback) return;

      const statements = getCallbackStatements(callback);
      if (statements.length !== 1) return;

      const statement = statements[0];
      if (
        statement.type === "ExpressionStatement" &&
        statement.expression?.type === "AssignmentExpression" &&
        statement.expression.left?.type === "MemberExpression" &&
        statement.expression.left.property?.type === "Identifier" &&
        statement.expression.left.property.name === "value"
      ) {
        context.report({
          node,
          message: "watchEffect() that only sets a ref — replace with a computed property for better performance",
        });
      }
    },
  }),
});
