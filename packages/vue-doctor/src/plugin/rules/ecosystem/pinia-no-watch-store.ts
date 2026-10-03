import { defineRule } from "../../define-rule.js";
import type { RuleContext, RuleVisitors } from "../../types.js";

// `store`, `authStore`, `userStore`; not `restore`, `bookstore` or `datastore`.
const STORE_NAME_PATTERN = /^store$|[a-z0-9_$]Store$/;

export default defineRule({
  meta: {
    id: "pinia-no-watch-store",
    category: "Ecosystem",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.1.0",
    help: "Use `<store>.$subscribe()` or watch specific primitive getters instead of deep watching the entire store.",
    agentGuidance: "Do not watch an entire store object. Watch a specific field with `watch(() => store.field, ...)`, or react to changes with `store.$subscribe()`.",
  },
  create(context: RuleContext): RuleVisitors {
    return {
      CallExpression(node: any) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "watch") return;

        if (node.arguments.length > 0) {
          const watchSource = node.arguments[0];

          let sourceName = "";
          if (watchSource.type === "Identifier") {
            sourceName = watchSource.name;
          } else if (watchSource.type === "ArrowFunctionExpression" && watchSource.body.type === "Identifier") {
            sourceName = watchSource.body.name;
          }

          if (STORE_NAME_PATTERN.test(sourceName)) {
             context.report({
              node: watchSource,
              message: "Watching an entire Pinia store object is extremely expensive. Use `<store>.$subscribe()` or watch specific primitive getters instead.",
             });
          }
        }
      },
    };
  },
});
