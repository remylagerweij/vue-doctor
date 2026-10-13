import { PASSIVE_EVENT_NAMES } from "../../constants.js";
import { defineRule } from "../../define-rule.js";
import { isFunctionNode, walkAst, WALK_STOP } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { isMemberProperty } from "./helpers.js";

const callsPreventDefault = (fn: EsTreeNode): boolean => {
  let found = false;
  walkAst(fn.body, (child: EsTreeNode) => {
    if (child.type === "CallExpression" && isMemberProperty(child.callee, "preventDefault")) {
      found = true;
      return WALK_STOP;
    }
  });
  return found;
};

export default defineRule({
  meta: {
    id: "client-passive-event-listeners",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Add `{ passive: true }` as the third argument: `addEventListener('touchmove', handler, { passive: true })`",
    agentGuidance:
      "Pass `{ passive: true }` as the third argument of `addEventListener` for `touchstart`, `touchmove` and `wheel`, so the browser can scroll without waiting for the handler. If the handler must call `preventDefault()`, pass `{ passive: false }` explicitly instead. `scroll` and `touchend` cannot block scrolling and are not reported.",
  },
  create: (context: RuleContext) => {
    const functionsByName = new Map<string, EsTreeNode>();
    const candidates: { node: EsTreeNode; eventName: string; handler: EsTreeNode | undefined }[] = [];

    return {
      FunctionDeclaration(node: EsTreeNode) {
        if (node.id?.type === "Identifier") functionsByName.set(node.id.name, node);
      },
      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type === "Identifier" && isFunctionNode(node.init)) functionsByName.set(node.id.name, node.init);
      },
      CallExpression(node: EsTreeNode) {
        if (!isMemberProperty(node.callee, "addEventListener") || (node.arguments?.length ?? 0) < 2) return;
        const eventName = node.arguments[0];
        if (eventName?.type !== "Literal" || typeof eventName.value !== "string") return;
        if (!PASSIVE_EVENT_NAMES.has(eventName.value)) return;

        const options = node.arguments[2];
        const hasPassive =
          options?.type === "ObjectExpression" &&
          options.properties?.some(
            (property: EsTreeNode) => property.key?.type === "Identifier" && property.key.name === "passive",
          );
        if (!hasPassive) candidates.push({ node, eventName: eventName.value, handler: node.arguments[1] });
      },
      "Program:exit"() {
        for (const { node, eventName, handler } of candidates) {
          const handlerFunction = isFunctionNode(handler)
            ? handler
            : handler?.type === "Identifier"
              ? functionsByName.get(handler.name)
              : undefined;
          if (handlerFunction && callsPreventDefault(handlerFunction)) continue;
          context.report({
            node,
            message: `addEventListener("${eventName}") without { passive: true } — the browser waits for the handler before scrolling`,
          });
        }
      },
    };
  },
});
