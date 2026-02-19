import { PASSIVE_EVENT_NAMES } from "../constants.js";
import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const clientPassiveEventListeners: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type === "MemberExpression" &&
        node.callee.property?.type === "Identifier" &&
        node.callee.property.name === "addEventListener" &&
        node.arguments?.length >= 2
      ) {
        const eventName = node.arguments[0];
        if (
          eventName?.type === "Literal" &&
          typeof eventName.value === "string" &&
          PASSIVE_EVENT_NAMES.has(eventName.value)
        ) {
          const options = node.arguments[2];
          const hasPassive =
            options?.type === "ObjectExpression" &&
            options.properties?.some(
              (property: EsTreeNode) =>
                property.key?.type === "Identifier" && property.key.name === "passive",
            );

          if (!hasPassive) {
            context.report({
              node,
              message: `addEventListener("${eventName.value}") without { passive: true } — blocks scrolling performance`,
            });
          }
        }
      }
    },
  }),
};
