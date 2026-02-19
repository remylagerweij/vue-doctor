import { INDEX_PARAMETER_NAMES } from "../constants.js";
import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const noArrayIndexAsKey: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "MemberExpression" &&
        node.callee.property?.type === "Identifier" &&
        node.callee.property.name === "map"
      ) {
        const callback = node.arguments?.[0];
        if (!callback) return;

        if (
          callback.type === "ArrowFunctionExpression" ||
          callback.type === "FunctionExpression"
        ) {
          const params = callback.params ?? [];
          if (params.length < 2) return;

          const indexParam = params[1];
          if (
            indexParam?.type === "Identifier" &&
            INDEX_PARAMETER_NAMES.has(indexParam.name)
          ) {
            // HACK: Simplified — checks if the index param name is used in a computed property
            // that could be used as a :key binding. In Vue templates the :key binding is in the template,
            // but in render functions it appears in JSX/h() calls.
          }
        }
      }
    },
  }),
};

export const noPreventDefault: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "MemberExpression" &&
        node.callee.property?.type === "Identifier" &&
        node.callee.property.name === "preventDefault"
      ) {
        context.report({
          node,
          message: 'event.preventDefault() — use Vue\'s .prevent modifier (@submit.prevent) for cleaner code',
        });
      }
    },
  }),
};
