import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-deep-watch",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Watch the specific properties you need (`() => state.user.name`) or use `watchEffect()` instead of `{ deep: true }`",
    agentGuidance: "Replace `{ deep: true }` with a watch on the specific properties you need, such as `watch(() => state.user.name, ...)`, or use `watchEffect` which tracks only what it reads.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type !== "Identifier" ||
        node.callee.name !== "watch"
      ) return;

      // The options object is the 3rd argument: watch(source, callback, options)
      const options = node.arguments?.[2];
      if (options?.type !== "ObjectExpression") return;

      const deepProp = options.properties?.find(
        (prop: EsTreeNode) =>
          prop.type === "Property" &&
          prop.key?.type === "Identifier" &&
          prop.key.name === "deep" &&
          prop.value?.type === "Literal" &&
          prop.value.value === true,
      );

      if (deepProp) {
        context.report({
          node,
          message: "watch() with { deep: true } traverses the entire object tree on every change — watch specific properties or use watchEffect()",
        });
      }
    },
  }),
});
