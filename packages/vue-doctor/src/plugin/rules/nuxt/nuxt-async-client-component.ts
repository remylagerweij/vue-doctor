import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "nuxt-async-client-component",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Avoid async setup in client components. Use `useFetch()` or `useAsyncData()` instead",
    agentGuidance: "Avoid `await` in the setup of a client-only component. Fetch with `useAsyncData()`/`useFetch()` or load in `onMounted` with a loading state.",
  },
  create: (context: RuleContext) => ({
    ExportDefaultDeclaration(node: EsTreeNode) {
      const declaration = node.declaration;
      if (!declaration) return;

      if (
        declaration.type === "CallExpression" &&
        declaration.callee?.type === "Identifier" &&
        declaration.callee.name === "defineComponent"
      ) {
        const options = declaration.arguments?.[0];
        if (options?.type !== "ObjectExpression") return;

        const setupProp = options.properties?.find(
          (prop: EsTreeNode) =>
            prop.type === "Property" &&
            prop.key?.type === "Identifier" &&
            prop.key.name === "setup",
        );

        if (setupProp?.value?.async) {
          context.report({
            node,
            message: "Async setup() in a client component — use useFetch() or useAsyncData() instead of making setup async",
          });
        }
      }
    },
  }),
});
