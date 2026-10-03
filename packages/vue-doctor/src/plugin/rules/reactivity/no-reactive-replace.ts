import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-reactive-replace",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `Object.assign(state, newState)` instead of replacing the reactive object reference",
    agentGuidance: "Reassigning a `reactive()` variable breaks every existing reference to it. Mutate it in place with `Object.assign(state, next)`, or switch to a `ref` and assign `.value`.",
  },
  create: (context: RuleContext) => ({
    AssignmentExpression(node: EsTreeNode) {
      if (node.operator !== "=") return;
      if (node.left?.type !== "Identifier") return;

      // Check if right side is a reactive() call
      if (
        node.right?.type === "CallExpression" &&
        node.right.callee?.type === "Identifier" &&
        node.right.callee.name === "reactive"
      ) {
        context.report({
          node,
          message: `Reassigning reactive variable "${node.left.name}" — use Object.assign(${node.left.name}, newValue) to preserve reactivity`,
        });
      }
    },
  }),
});
