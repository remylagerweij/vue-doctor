import { createApiResolver, findDeferringCall, isGuardedByInstanceCheck, type ApiResolver } from "../../composition-api.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-instance-api-in-async-callback",
    category: "Correctness",
    defaultSeverity: "off",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "2.5.0",
    help: "Register hooks and call `provide`/`inject` synchronously in setup; inside the callback, only use what setup already obtained",
    agentGuidance:
      "Callbacks passed to `setTimeout`, `setInterval`, `requestAnimationFrame`, `nextTick`, `.then()/.catch()/.finally()`, `addEventListener` or a (non-immediate) `watch` run after setup has returned, when no component is active. Lifecycle hooks registered there never fire, `provide` does nothing and `inject`, `useRoute()`, `useRouter()` and `useI18n()` return undefined. Call the API synchronously in setup and keep the result (`const route = useRoute()`; `onUnmounted(() => clearTimeout(timer))`), then use that value inside the callback. Hooks called inside another hook's callback (`onMounted(() => onUnmounted(...))`) are fine and not reported.",
  },
  create: (context: RuleContext) => {
    let resolver: ApiResolver | null = null;
    return {
      Program(node: EsTreeNode) {
        resolver = createApiResolver(node);
      },
      CallExpression(node: EsTreeNode) {
        if (!resolver) return;
        const api = resolver.resolve(node.callee);
        if (api?.kind !== "instance") return;
        const deferring = findDeferringCall(node, resolver);
        if (!deferring || isGuardedByInstanceCheck(node)) return;
        context.report({
          node,
          message: `${api.name}() is called in a ${deferring} callback, which runs after setup when no component is active: it has no effect or returns undefined`,
        });
      },
    };
  },
});
