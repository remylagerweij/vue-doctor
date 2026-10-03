import { getFilename } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "nuxt-require-server-route-error-handling",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Wrap the handler body in try/catch and throw `createError({ statusCode, statusMessage })` on failure",
    agentGuidance: "Wrap the body of `defineEventHandler` in try/catch and rethrow failures with `createError({ statusCode, statusMessage })` so clients get a proper error response.",
  },
  create: (context: RuleContext) => ({
    ExportDefaultDeclaration(node: EsTreeNode) {
      const filename = getFilename(context);
      if (!filename.includes("server/")) return;

      const decl = node.declaration;
      if (!decl) return;

      // Check for defineEventHandler
      if (
        decl.type === "CallExpression" &&
        decl.callee?.type === "Identifier" &&
        decl.callee.name === "defineEventHandler"
      ) {
        const handler = decl.arguments?.[0];
        if (!handler) return;

        const body =
          handler.type === "ArrowFunctionExpression" || handler.type === "FunctionExpression"
            ? handler.body
            : null;

        if (body?.type === "BlockStatement") {
          const hasTryCatch = body.body?.some(
            (s: EsTreeNode) => s.type === "TryStatement",
          );
          if (!hasTryCatch) {
            context.report({
              node,
              message: "Server route handler without try/catch — wrap in try/catch to handle errors gracefully",
            });
          }
        }
      }
    },
  }),
});
