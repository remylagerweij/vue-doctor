import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-undeferred-third-party",
    category: "Bundle Size",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `useHead` with `defer: true` or add the `defer` attribute to third-party scripts",
    agentGuidance: "Add `defer: true` (or `async: true`) to every script entry with a `src` passed to `useHead({ script: [...] })` so third-party scripts do not block rendering.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        node.callee.name === "useHead" &&
        node.arguments?.[0]?.type === "ObjectExpression"
      ) {
        const scriptProp = node.arguments[0].properties?.find(
          (prop: EsTreeNode) =>
            prop.type === "Property" &&
            prop.key?.type === "Identifier" &&
            prop.key.name === "script",
        );

        if (scriptProp?.value?.type === "ArrayExpression") {
          for (const element of scriptProp.value.elements ?? []) {
            if (element?.type !== "ObjectExpression") continue;

            const hasSrc = element.properties?.some(
              (prop: EsTreeNode) =>
                prop.key?.type === "Identifier" && prop.key.name === "src",
            );
            const hasDefer = element.properties?.some(
              (prop: EsTreeNode) =>
                prop.key?.type === "Identifier" &&
                (prop.key.name === "defer" || prop.key.name === "async"),
            );

            if (hasSrc && !hasDefer) {
              context.report({
                node: element,
                message: 'Third-party script blocks rendering — add defer: true or async: true',
              });
            }
          }
        }
      }
    },
  }),
});
