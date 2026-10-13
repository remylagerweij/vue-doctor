import { findEnclosingFunction, getFilename, isSetupFunction } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import { isNuxtContext, isNuxtSuspenseEntry } from "../../nuxt-files.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-async-setup-without-suspense",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Wrap the async component in `<Suspense>` with a fallback, or move the awaited work into `onMounted()` or a composable",
    agentGuidance: "A top-level `await` in `<script setup>` (or an `async setup()`) makes the component async. Ensure a parent renders it inside `<Suspense>` with a fallback, or move the awaited work into `onMounted` or a composable. In Nuxt, `app.vue`, `error.vue`, pages and layouts are not reported: Nuxt renders them inside `<Suspense>`.",
  },
  create: (context: RuleContext): RuleVisitors => {
    if (!getFilename(context).endsWith(".vue")) return {};
    // Nuxt renders app.vue, error.vue, pages and layouts inside <Suspense> (NuxtPage / NuxtLayout).
    if (isNuxtContext(context) && isNuxtSuspenseEntry(context)) return {};
    return {
      AwaitExpression(node: EsTreeNode) {
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
    };
  },
});
