import { getCallbackStatements, getWatchCallback, isSpecificCall } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-watch-for-computed",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Replace the watcher with a computed property: `const value = computed(() => transform(source))`",
    agentGuidance: "The watcher only derives a value from its source. Delete the watcher and the ref it writes, and declare `const value = computed(() => ...)` using the same source.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, "watch") || node.arguments?.length < 2) return;

      const callback = getWatchCallback(node);
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
          message: "watch() that only sets a ref — replace with a computed property",
        });
      }
    },
  }),
});
