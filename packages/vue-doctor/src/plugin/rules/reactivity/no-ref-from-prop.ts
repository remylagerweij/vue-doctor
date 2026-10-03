import { isSpecificCall } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-ref-from-prop",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Remove the ref and derive inline: `const value = computed(() => transform(props.propName))`",
    agentGuidance: "Do not copy a prop into a `ref()`; the copy goes stale when the prop changes. Use `computed(() => props.x)` for derived values, or emit an event to the parent when the value must be edited.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, "ref") || !node.arguments?.length) return;

      const initializer = node.arguments[0];
      if (initializer.type !== "MemberExpression") return;

      if (
        initializer.object?.type === "Identifier" &&
        initializer.object.name === "props"
      ) {
        const propName = initializer.property?.name ?? "prop";
        context.report({
          node,
          message: `ref() initialized from props.${propName} — this creates a copy that won't stay in sync. Use computed() or toRef(props, '${propName}') instead`,
        });
      }
    },
  }),
});
