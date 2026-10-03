import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "js-batch-dom-css",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Batch style changes with `el.style.cssText` or `el.classList.add()` to avoid multiple reflows",
    agentGuidance: "Batch consecutive `el.style.x = ...` writes into one `el.style.cssText`/`Object.assign(el.style, {...})` or toggle a CSS class, so the browser lays out once.",
  },
  create: (context: RuleContext) => {
    const isStyleAssignment = (node: EsTreeNode): boolean =>
      node.type === "ExpressionStatement" &&
      node.expression?.type === "AssignmentExpression" &&
      node.expression.left?.type === "MemberExpression" &&
      node.expression.left.object?.type === "MemberExpression" &&
      node.expression.left.object.property?.type === "Identifier" &&
      node.expression.left.object.property.name === "style";

    return {
      BlockStatement(node: EsTreeNode) {
        const statements = node.body ?? [];
        for (let i = 1; i < statements.length; i++) {
          if (isStyleAssignment(statements[i]) && isStyleAssignment(statements[i - 1])) {
            context.report({
              node: statements[i],
              message:
                "Multiple sequential element.style assignments — batch with cssText or classList for fewer reflows",
            });
          }
        }
      },
    };
  },
});
