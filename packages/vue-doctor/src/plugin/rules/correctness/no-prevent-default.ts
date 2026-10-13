import { getFilename, isFunctionNode, walkAst, WALK_SKIP } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

// Registration APIs where the handler is attached imperatively; there is no template to put a
// `.prevent` modifier on (and `{ passive: false }` listeners legitimately call preventDefault).
const LISTENER_REGISTRATION_METHODS = new Set(["addEventListener", "removeEventListener", "on", "once", "addListener"]);

const isListenerRegistration = (call: EsTreeNode | undefined): boolean =>
  call?.type === "CallExpression" &&
  call.callee?.type === "MemberExpression" &&
  call.callee.property?.type === "Identifier" &&
  LISTENER_REGISTRATION_METHODS.has(call.callee.property.name);

const exitsEarly = (statement: EsTreeNode): boolean => {
  let exits = false;
  walkAst(statement, (child) => {
    if (isFunctionNode(child)) return WALK_SKIP;
    if (child.type === "ReturnStatement" || child.type === "ThrowStatement") exits = true;
  });
  return exits;
};

// The handler whose body runs this call unconditionally (top level, no earlier guard `return`), else null.
const getUnconditionalHandler = (call: EsTreeNode): EsTreeNode | null => {
  const statement = call.parent;
  if (statement?.type === "ExpressionStatement") {
    const block = statement.parent;
    const handler = block?.parent;
    if (block?.type !== "BlockStatement" || !isFunctionNode(handler) || handler?.body !== block) return null;
    const body: EsTreeNode[] = block.body;
    const preceding = body.slice(0, body.indexOf(statement));
    return preceding.some((earlier) => earlier.type === "IfStatement" && exitsEarly(earlier)) ? null : handler;
  }
  return statement?.type === "ArrowFunctionExpression" && statement.body === call ? statement : null;
};

// `const onKey = (e) => {}` and `function onKey(e) {}` are named; inline handlers are not.
const handlerName = (handler: EsTreeNode): string | null => {
  if (handler.type === "FunctionDeclaration") return handler.id?.name ?? null;
  const parent = handler.parent;
  return parent?.type === "VariableDeclarator" && parent.init === handler && parent.id?.type === "Identifier" ? parent.id.name : null;
};

const REGISTRATION_FUNCTIONS = new Set(["useEventListener"]);

export default defineRule({
  meta: {
    id: "no-prevent-default",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Use Vue's `.prevent` modifier: `@submit.prevent` instead of calling `event.preventDefault()`",
    agentGuidance: "Use Vue's event modifier in the template, such as `@submit.prevent`, instead of calling `event.preventDefault()` in the handler. Only handlers in `.vue` files that always call `preventDefault()` on their own event argument are flagged; calls after a guard `return`, other conditional calls and handlers registered with addEventListener/useEventListener are left alone, because `.prevent` would cancel events the handler deliberately lets through (Tab, unrelated keys).",
  },
  create: (context: RuleContext): RuleVisitors => {
    // A script file has no template to put `.prevent` on.
    if (!getFilename(context).endsWith(".vue")) return {};
    const registeredNames = new Set<string>();
    const reports: { node: EsTreeNode; handler: EsTreeNode }[] = [];

    return {
      CallExpression(node: EsTreeNode) {
        const isRegistration =
          isListenerRegistration(node) || (node.callee?.type === "Identifier" && REGISTRATION_FUNCTIONS.has(node.callee.name));
        if (isRegistration) {
          for (const argument of node.arguments ?? []) if (argument.type === "Identifier") registeredNames.add(argument.name);
          return;
        }
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
        reports.push({ node, handler });
      },
      "Program:exit"() {
        for (const { node, handler } of reports) {
          const name = handlerName(handler);
          if (name !== null && registeredNames.has(name)) continue;
          context.report({
            node,
            message: "event.preventDefault() — use Vue's .prevent modifier (@submit.prevent) for cleaner code",
          });
        }
      },
    };
  },
});
