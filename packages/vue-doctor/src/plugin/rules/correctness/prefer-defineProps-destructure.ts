import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "prefer-defineProps-destructure",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Destructure props for reactive access: `const { prop1, prop2 } = defineProps<Props>()`",
    agentGuidance: "Use reactive props destructure: `const { a, b = 1 } = defineProps<Props>()`, which stays reactive in Vue 3.5+. Check the project's Vue version first.",
  },
  create: (context: RuleContext) => ({
    VariableDeclarator(node: EsTreeNode) {
      if (
        node.init?.type === "CallExpression" &&
        node.init.callee?.type === "Identifier" &&
        node.init.callee.name === "defineProps" &&
        node.id?.type === "Identifier"
      ) {
        context.report({
          node,
          message: `const ${node.id.name} = defineProps() — destructure props for reactive access: const { prop1, prop2 } = defineProps<Props>()`,
        });
      }
    },
  }),
});
