import { GIANT_COMPONENT_LINE_THRESHOLD, UPPERCASE_PATTERN } from "../constants.js";
import { isUppercaseName } from "../helpers.js";
import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const noGiantComponent: Rule = {
  create: (context: RuleContext) => ({
    Program(node: EsTreeNode) {
      if (!node.body?.length) return;

      const lastStatement = node.body[node.body.length - 1];
      const totalLines = lastStatement?.loc?.end?.line ?? 0;

      if (totalLines > GIANT_COMPONENT_LINE_THRESHOLD) {
        const filename = context.getFilename?.() ?? "";
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
};

export const noNestedComponentDefinition: Rule = {
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
};
