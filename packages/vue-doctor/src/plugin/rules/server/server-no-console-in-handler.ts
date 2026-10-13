import { getFilename } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

/** Debug-level output; `console.info`/`warn`/`error` on a real event or failure path is legitimate operational logging. */
const DEBUG_METHODS: ReadonlySet<string> = new Set(["log", "debug", "trace"]);

export default defineRule({
  meta: {
    id: "server-no-console-in-handler",
    category: "Server",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Remove debug `console.log/debug/trace` calls from request handlers; they flood production logs and can leak request data",
    agentGuidance:
      "Delete leftover `console.log`, `console.debug` and `console.trace` calls in `server/api`, `server/routes` and `server/middleware` handlers, especially ones that print request data, user ids, emails or addresses (PII). " +
      "If the message reports a degraded path or a failure someone must act on, keep it as `console.warn` or `console.error` with a fixed prefix and no personal data. Do not add a logging library just for this.",
  },
  create: (context: RuleContext) => {
    const filename = getFilename(context);
    const isServerFile = /server\/(api|routes|middleware)\//.test(filename);

    return {
      CallExpression(node: EsTreeNode) {
        if (!isServerFile) return;

        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.object?.type === "Identifier" &&
          node.callee.object.name === "console" &&
          node.callee.property?.type === "Identifier"
        ) {
          const method = node.callee.property.name;
          if (DEBUG_METHODS.has(method)) {
            context.report({
              node,
              message: `console.${method}() left in a request handler — debug output is noise in production logs and can leak request data (PII); remove it, or use console.warn/error for a real failure`,
            });
          }
        }
      },
    };
  },
});
