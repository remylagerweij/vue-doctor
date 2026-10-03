import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "require-defineprops-types",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Declare props with a type argument: `defineProps<{ title: string }>()`",
    agentGuidance: "Declare props with a type argument, for example `defineProps<{ title: string; count?: number }>()`, instead of an untyped call or a string array.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "defineProps" &&
        // oxlint exposes the type argument list as `typeArguments`, older parsers as `typeParameters`.
        !(node.typeArguments ?? node.typeParameters)?.params?.length &&
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
});
