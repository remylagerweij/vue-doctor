import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-reactive-destructure",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `toRefs(state)` before destructuring to keep reactivity, or access properties directly: `state.count`",
    agentGuidance: "Destructuring a `reactive()` object copies plain values and drops reactivity. Wrap it with `toRefs(state)` before destructuring, or read `state.prop` directly.",
  },
  create: (context: RuleContext) => ({
    VariableDeclarator(node: EsTreeNode) {
      if (node.id?.type !== "ObjectPattern" && node.id?.type !== "ArrayPattern") return;
      if (node.init?.type !== "CallExpression") return;

      const callee = node.init.callee;
      if (
        callee?.type === "Identifier" &&
        (callee.name === "reactive" || callee.name === "toRefs")
      ) {
        // toRefs is fine to destructure, only flag reactive
        if (callee.name === "reactive") {
          context.report({
            node,
            message: "Destructuring reactive() loses reactivity — use toRefs() or access properties directly",
          });
        }
      }
    },
  }),
});
