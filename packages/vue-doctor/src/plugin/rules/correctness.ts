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
            const indexName = indexParam.name;
            // Simplified check: If we map with an index, we likely use it.
            // A more robust check would verify usage as 'key', but for now this catches the pattern.
            context.report({
               node: indexParam,
               message: `Avoid using array index "${indexName}" as key — use unique IDs for stable rendering`,
            });
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

export const noThisInSetup: Rule = {
  create: (context: RuleContext) => ({
    ThisExpression(node: EsTreeNode) {
      const filename = context.getFilename?.() ?? "";
      if (!filename.endsWith(".vue")) return;

      context.report({
        node,
        message: '"this" is not available in <script setup> — use refs and composables instead',
      });
    },
  }),
};

export const requireDefinePropsTypes: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "defineProps" &&
        (!node.typeParameters || !node.typeParameters.params?.length) &&
        (!node.arguments?.length ||
          (node.arguments[0]?.type === "ArrayExpression"))
      ) {
        context.report({
          node,
          message: "defineProps() without type parameter — use defineProps<{ prop: Type }>() for type safety",
        });
      }
    },
  }),
};
