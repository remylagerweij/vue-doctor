import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const DOM_METHODS = new Set([
        "getElementById",
        "getElementsByClassName",
        "getElementsByTagName",
        "querySelector",
        "querySelectorAll",
        "createElement",
      ]);

export default defineRule({
  meta: {
    id: "no-direct-dom-manipulation",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use template refs: `const el = ref<HTMLElement>()` with `ref=\"el\"` instead of `document.querySelector()`",
    agentGuidance: "Use a template ref (`const el = ref<HTMLElement | null>(null)` with `ref=\"el\"`) and access `el.value` after mount instead of `document.querySelector`.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (node.callee?.type !== "MemberExpression") return;

      const objectName =
        node.callee.object?.type === "Identifier" ? node.callee.object.name : null;
      if (objectName !== "document") return;

      const methodName =
        node.callee.property?.type === "Identifier" ? node.callee.property.name : null;

      if (methodName && DOM_METHODS.has(methodName)) {
        context.report({
          node,
          message: `document.${methodName}() — use template refs instead of direct DOM manipulation in Vue`,
        });
      }
    },
  }),
});
