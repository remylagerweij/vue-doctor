import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

// `nextTick()`, `Vue.nextTick()` and the Options API instance method `this.$nextTick()`.
const NEXT_TICK_NAMES = new Set(["nextTick", "$nextTick"]);

const isNextTickCall = (node: EsTreeNode | null | undefined): boolean =>
  node?.type === "CallExpression" &&
  ((node.callee?.type === "Identifier" && node.callee.name === "nextTick") ||
    (node.callee?.type === "MemberExpression" &&
      node.callee.property?.type === "Identifier" &&
      NEXT_TICK_NAMES.has(node.callee.property.name)));

export default defineRule({
  meta: {
    id: "no-missing-await-nextTick",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Add `await` before `nextTick()` or use `nextTick().then()` to ensure DOM updates are applied",
    agentGuidance: "`nextTick()` returns a promise. Add `await` in an async function, or chain `.then()`, before code that reads the updated DOM.",
  },
  create: (context: RuleContext) => ({
    // Only a bare `nextTick();` statement discards the promise. Awaited, returned, `.then`-ed,
    // stored, passed on, `void`-ed and callback-style `nextTick(() => ...)` calls are all fine.
    ExpressionStatement(node: EsTreeNode) {
      const call = node.expression;
      if (!isNextTickCall(call) || (call.arguments?.length ?? 0) > 0) return;
      context.report({
        node: call,
        message: "Missing await on nextTick(). This can lead to race conditions where the DOM is not yet updated when the subsequent code runs.",
      });
    },
  }),
});
