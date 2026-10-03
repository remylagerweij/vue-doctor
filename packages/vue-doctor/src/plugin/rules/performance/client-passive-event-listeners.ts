import { PASSIVE_EVENT_NAMES } from "../../constants.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "client-passive-event-listeners",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Add `{ passive: true }` as the third argument: `addEventListener('scroll', handler, { passive: true })`",
    agentGuidance: "Pass `{ passive: true }` as the third argument of `addEventListener` for scroll, touch and wheel events, unless the handler must call `preventDefault()`.",
  },
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
});
