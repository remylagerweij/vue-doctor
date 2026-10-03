import { getFilename } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "server-no-console-in-handler",
    category: "Server",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use a structured logger like `consola` or `pino` for server-side logging instead of `console.log()`",
    agentGuidance: "Replace `console.log/info/warn` in server handlers with a structured logger such as `consola` or `pino`; keep the message and add context as fields.",
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
          if (method === "log" || method === "info" || method === "warn") {
            context.report({
              node,
              message: `console.${method}() in server handler — use a structured logger like consola or pino instead`,
            });
          }
        }
      },
    };
  },
});
