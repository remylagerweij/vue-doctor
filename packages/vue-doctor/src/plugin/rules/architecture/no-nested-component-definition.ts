import { isUppercaseName } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-nested-component-definition",
    category: "Architecture",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Move to a separate .vue file or to a composable",
    agentGuidance: "A component defined inside another component is recreated on every render and loses state. Move it to its own `.vue` file or to module scope and import it.",
  },
  create: (context: RuleContext) => {
    let isInsideSetup = false;

    return {
      "CallExpression"(node: EsTreeNode) {
        if (
          node.callee?.type === "Identifier" &&
          node.callee.name === "defineComponent"
        ) {
          if (isInsideSetup) {
            context.report({
              node,
              message: "Nested defineComponent() call — move to a separate .vue file",
            });
          }
        }
      },

      "Property"(node: EsTreeNode) {
        if (
          node.key?.type === "Identifier" &&
          node.key.name === "setup" &&
          (node.value?.type === "FunctionExpression" || node.value?.type === "ArrowFunctionExpression")
        ) {
          isInsideSetup = true;
        }
      },
      "Property:exit"(node: EsTreeNode) {
        if (
          node.key?.type === "Identifier" &&
          node.key.name === "setup"
        ) {
          isInsideSetup = false;
        }
      },

      VariableDeclarator(node: EsTreeNode) {
        if (
          node.id?.type === "Identifier" &&
          isUppercaseName(node.id.name) &&
          node.init?.type === "ObjectExpression"
        ) {
          const hasRender = node.init.properties?.some(
            (prop: EsTreeNode) =>
              prop.type === "Property" &&
              prop.key?.type === "Identifier" &&
              (prop.key.name === "render" || prop.key.name === "template" || prop.key.name === "setup"),
          );

          if (hasRender && isInsideSetup) {
            context.report({
              node,
              message: `Nested component "${node.id.name}" defined inside setup — move to a separate .vue file`,
            });
          }
        }
      },
    };
  },
});
