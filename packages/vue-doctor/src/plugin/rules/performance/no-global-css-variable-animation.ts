import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-global-css-variable-animation",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Set the variable on the nearest element instead of a parent, or use `@property` with `inherits: false`",
    agentGuidance: "Do not animate a CSS variable on `:root`/`body`; every dependent element restyles each frame. Set the variable on the nearest element that uses it, or register it with `@property` and `inherits: false`.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "MemberExpression" &&
        node.callee.property?.type === "Identifier" &&
        node.callee.property.name === "setProperty"
      ) {
        // `style.setProperty("color", ...)` sets a regular property; only custom properties
        // (`--name`, or a name only known at runtime) are the concern.
        const name = node.arguments?.[0];
        if (name?.type === "Literal" && typeof name.value === "string" && !name.value.startsWith("--")) return;
        context.report({
          node,
          message: "Setting CSS variables directly via DOM API can cause expensive repaints (especially in animation loops) — use Vue reactive :style bindings instead",
        });
      }
    },
  }),
});
