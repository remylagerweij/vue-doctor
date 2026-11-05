import { defineRule } from "../../define-rule.js";
import { isClientRenderedPage } from "../../nuxt-files.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

export default defineRule({
  meta: {
    id: "nuxt-no-client-fetch-for-server-data",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Use `useFetch()` or `useAsyncData()` in Nuxt — data is fetched on the server and avoids client round-trip",
    agentGuidance: "Fetch page data with `useFetch()` or `useAsyncData()` so it is loaded during SSR and not duplicated on the client; do not call `fetch`/`axios` in `onMounted` for initial data.",
  },
  create: (context: RuleContext): RuleVisitors => {
    if (isClientRenderedPage(context)) return {};

    return {
      CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "Identifier" &&
        (node.callee.name === "onMounted" || node.callee.name === "onBeforeMount")
      ) {
        const callback = node.arguments?.[0];
        if (!callback) return;

        if (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression") {
          const body = callback.body;
          if (body?.type === "BlockStatement") {
            for (const statement of body.body ?? []) {
              if (
                statement.type === "ExpressionStatement" &&
                statement.expression?.type === "AwaitExpression" &&
                statement.expression.argument?.type === "CallExpression"
              ) {
                const call = statement.expression.argument;
                if (
                  call.callee?.type === "Identifier" &&
                  (call.callee.name === "fetch" || call.callee.name === "$fetch")
                ) {
                  context.report({
                    node,
                    message: `fetch() in ${node.callee.name} — use useFetch() or useAsyncData() to fetch data on the server instead`,
                  });
                }
              }
            }
          }
        }
      }
    },
  };
},
});
