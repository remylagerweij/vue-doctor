import { GIANT_COMPONENT_LINE_THRESHOLD } from "../../constants.js";
import { getFilename } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-giant-component",
    category: "Architecture",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Extract logical sections into focused components or composables",
    agentGuidance: "Split the component by responsibility. Extract self-contained template sections into child components and stateful logic into composables; keep behaviour and props/emits of the public component unchanged.",
  },
  create: (context: RuleContext) => ({
    Program(node: EsTreeNode) {
      if (!node.body?.length) return;

      const lastStatement = node.body[node.body.length - 1];
      const totalLines = lastStatement?.loc?.end?.line ?? 0;

      if (totalLines > GIANT_COMPONENT_LINE_THRESHOLD) {
        const filename = getFilename(context);
        const isVueFile = filename.endsWith(".vue");

        // If it's a Vue file, or a JS/TS file that exports a component explicitly using defineComponent
        const isComponentFile = isVueFile || node.body.some((statement: EsTreeNode) => {
          if (statement.type === "ExportDefaultDeclaration") {
            return statement.declaration?.type === "CallExpression" &&
                   statement.declaration.callee?.type === "Identifier" &&
                   statement.declaration.callee.name === "defineComponent";
          }
          return (statement.type === "ExpressionStatement" &&
            statement.expression?.type === "CallExpression" &&
            statement.expression.callee?.type === "Identifier" &&
            statement.expression.callee.name === "defineComponent");
        });

        if (isComponentFile) {
          context.report({
            node,
            message: `Component has ${totalLines}+ lines — consider extracting logic into composables or child components`,
          });
        }
      }
    },
  }),
});
