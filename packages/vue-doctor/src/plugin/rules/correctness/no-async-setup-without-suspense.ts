import { findEnclosingFunction, getFilename, isSetupFunction } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-async-setup-without-suspense",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Wrap the async component in `<Suspense>` with a fallback, or move the awaited work into `onMounted()` or a composable",
    agentGuidance: "A top-level `await` in `<script setup>` (or an `async setup()`) makes the component async. Ensure a parent renders it inside `<Suspense>` with a fallback, or move the awaited work into `onMounted` or a composable.",
  },
  create: (context: RuleContext) => ({
    AwaitExpression(node: EsTreeNode) {
      if (!getFilename(context).endsWith(".vue")) return;

      // Only an await that runs directly in the component setup makes the component async:
      // top-level (script setup) or inside the setup() hook itself. An await inside a nested
      // function (onMounted callback, event handler, helper) does not.
      const enclosingFunction = findEnclosingFunction(node);
      if (enclosingFunction && !isSetupFunction(enclosingFunction)) return;

      context.report({
        node,
        message: "Async components require a <Suspense> boundary — handle loading states to prevent hydration mismatch",
      });
    },
  }),
});
