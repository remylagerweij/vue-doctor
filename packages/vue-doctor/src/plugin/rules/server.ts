import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const serverNoConsoleInHandler: Rule = {
  create: (context: RuleContext) => {
    const filename = context.getFilename?.() ?? "";
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
};
