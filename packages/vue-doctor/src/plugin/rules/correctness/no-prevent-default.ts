import { isFunctionNode } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

// Registration APIs where the handler is attached imperatively; there is no template to put a
// `.prevent` modifier on (and `{ passive: false }` listeners legitimately call preventDefault).
const LISTENER_REGISTRATION_METHODS = new Set(["addEventListener", "removeEventListener", "on", "once", "addListener"]);

const isListenerRegistration = (call: EsTreeNode | undefined): boolean =>
  call?.type === "CallExpression" &&
  call.callee?.type === "MemberExpression" &&
  call.callee.property?.type === "Identifier" &&
  LISTENER_REGISTRATION_METHODS.has(call.callee.property.name);

// The handler function this call sits at the top level of, when the call is an unconditional
// statement of the function body (or the whole expression body of an arrow). Calls nested in
// `if`, `&&`, `try`, loops or inner callbacks are conditional by nature and cannot be replaced
// by a static `.prevent` modifier.
const getUnconditionalHandler = (call: EsTreeNode): EsTreeNode | null => {
  const statement = call.parent;
  if (statement?.type === "ExpressionStatement") {
    const block = statement.parent;
    const handler = block?.parent;
    return block?.type === "BlockStatement" && isFunctionNode(handler) && handler?.body === block ? handler : null;
  }
  return statement?.type === "ArrowFunctionExpression" && statement.body === call ? statement : null;
};

export default defineRule({
  meta: {
    id: "no-prevent-default",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use Vue's `.prevent` modifier: `@submit.prevent` instead of calling `event.preventDefault()`",
    agentGuidance: "Use Vue's event modifier in the template, such as `@submit.prevent`, instead of calling `event.preventDefault()` in the handler. Only handlers that always call `preventDefault()` on their own event argument are flagged; conditional calls and listeners registered with addEventListener are left alone.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        node.callee?.type !== "MemberExpression" ||
        node.callee.property?.type !== "Identifier" ||
        node.callee.property.name !== "preventDefault" ||
        node.callee.object?.type !== "Identifier"
      ) {
        return;
      }

      // Must be the handler's own event argument: `(event) => { event.preventDefault(); ... }`.
      const handler = getUnconditionalHandler(node);
      const eventParam = handler?.params?.[0];
      if (!handler || eventParam?.type !== "Identifier" || eventParam.name !== node.callee.object.name) return;

      if (isListenerRegistration(handler.parent)) return;

      context.report({
        node,
        message: 'event.preventDefault() — use Vue\'s .prevent modifier (@submit.prevent) for cleaner code',
      });
    },
  }),
});
