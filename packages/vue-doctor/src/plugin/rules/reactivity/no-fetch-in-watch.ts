import { WATCH_FUNCTIONS } from "../../constants.js";
import { analyzeWatchCallback, getWatchCallback, getWatchEffectCallback, isSpecificCall } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-fetch-in-watch",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `useFetch()` (Nuxt) or `useQuery()` from @tanstack/vue-query instead of watch + fetch",
    agentGuidance: "Do not fetch inside a watcher. Move the request into `useFetch`/`useAsyncData` (Nuxt) or a query composable such as `useQuery` whose key is the reactive source, so the framework handles caching, cancellation and SSR.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, WATCH_FUNCTIONS)) return;

      const isWatchEffect = node.callee.name !== "watch";
      const callback = isWatchEffect ? getWatchEffectCallback(node) : getWatchCallback(node);
      if (!callback) return;

      if (analyzeWatchCallback(callback).hasFetchCall) {
        context.report({
          node,
          message: `fetch() inside ${node.callee.name} — use useFetch(), useAsyncData(), or a data-fetching library instead`,
        });
      }
    },
  }),
});
