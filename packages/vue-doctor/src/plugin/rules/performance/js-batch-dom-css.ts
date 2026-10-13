import { defineRule } from "../../define-rule.js";
import { isFunctionNode } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { VISITOR_KEYS } from "../../visitor-keys.js";
import { getMethodName, isIterationCallback, isMemberProperty, unwrapExpression } from "./helpers.js";

const LAYOUT_READ_PROPERTIES = new Set([
  "offsetHeight", "offsetWidth", "offsetTop", "offsetLeft", "offsetParent",
  "clientHeight", "clientWidth", "clientTop", "clientLeft",
  "scrollHeight", "scrollWidth", "scrollTop", "scrollLeft", "innerText",
]);
const LAYOUT_READ_METHODS = new Set(["getBoundingClientRect", "getClientRects", "getComputedStyle"]);
const STYLE_WRITE_METHODS = new Set(["setProperty", "removeProperty"]);
const CLASS_LIST_WRITE_METHODS = new Set(["add", "remove", "toggle", "replace"]);
const LOOP_TYPES = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);

interface LayoutAccess {
  kind: "read" | "write";
  node: EsTreeNode;
}

const isStyleWriteTarget = (target: EsTreeNode | null | undefined): boolean =>
  target?.type === "MemberExpression" &&
  (isMemberProperty(target, "style") ||
    isMemberProperty(target, "className") ||
    isMemberProperty(target.object, "style"));

const isStyleWriteCall = (call: EsTreeNode): boolean => {
  const method = getMethodName(call);
  const receiver = call.callee?.object;
  if (method && STYLE_WRITE_METHODS.has(method)) return isMemberProperty(receiver, "style");
  if (method && CLASS_LIST_WRITE_METHODS.has(method)) return isMemberProperty(receiver, "classList");
  return (
    method === "assign" &&
    receiver?.type === "Identifier" &&
    receiver.name === "Object" &&
    isMemberProperty(call.arguments?.[0], "style")
  );
};

const isLayoutReadCall = (call: EsTreeNode): boolean => {
  if (call.callee?.type === "Identifier") return call.callee.name === "getComputedStyle";
  return LAYOUT_READ_METHODS.has(getMethodName(call) ?? "");
};

const isLayoutRead = (node: EsTreeNode | null | undefined): boolean => {
  const expression = unwrapExpression(node);
  if (expression?.type === "CallExpression") return isLayoutReadCall(expression);
  return (
    expression?.type === "MemberExpression" &&
    !expression.computed &&
    LAYOUT_READ_PROPERTIES.has(expression.property?.name)
  );
};

// Accesses in evaluation order; nested functions run later and are skipped.
const collectAccesses = (node: EsTreeNode | null | undefined, accesses: LayoutAccess[]): void => {
  if (!node || typeof node !== "object" || isFunctionNode(node)) return;
  if (node.type === "AssignmentExpression") {
    collectAccesses(node.right, accesses);
    if (isStyleWriteTarget(node.left)) accesses.push({ kind: "write", node });
    return;
  }
  const keys = VISITOR_KEYS[node.type] ?? Object.keys(node).filter((key) => key !== "parent");
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) for (const item of child) collectAccesses(item, accesses);
    else if (child && typeof child === "object" && child.type) collectAccesses(child, accesses);
  }
  if (node.type === "CallExpression") {
    if (isStyleWriteCall(node)) accesses.push({ kind: "write", node });
    else if (isLayoutReadCall(node)) accesses.push({ kind: "read", node });
  } else if (node.type === "MemberExpression" && isLayoutRead(node)) {
    accesses.push({ kind: "read", node });
  }
};

// `el.offsetHeight;` / `void el.offsetHeight` flush layout on purpose to restart a transition.
const isDeliberateReflow = (statement: EsTreeNode): boolean => {
  if (statement.type !== "ExpressionStatement") return false;
  const expression = statement.expression?.type === "UnaryExpression" ? statement.expression.argument : statement.expression;
  return isLayoutRead(expression);
};

const isRepeatedBody = (block: EsTreeNode): boolean => {
  const owner = block.parent;
  if (!owner) return false;
  if (LOOP_TYPES.has(owner.type)) return owner.body === block;
  return isFunctionNode(owner) && isIterationCallback(owner);
};

const findThrashingRead = (accesses: LayoutAccess[], repeated: boolean): LayoutAccess | undefined => {
  const firstWrite = accesses.findIndex((access) => access.kind === "write");
  if (firstWrite === -1) return undefined;
  if (repeated) return accesses.find((access) => access.kind === "read");
  let lastWrite = accesses.length - 1;
  while (accesses[lastWrite].kind !== "write") lastWrite--;
  return accesses.find((access, index) => access.kind === "read" && index > firstWrite && index < lastWrite);
};

export default defineRule({
  meta: {
    id: "js-batch-dom-css",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Read layout (`offsetHeight`, `getBoundingClientRect()`) before writing styles, not between style writes",
    agentGuidance:
      "Reported when a layout read sits between style writes in the same block, or a loop body both writes styles and reads layout: each read forces a synchronous reflow (layout thrashing). Do all reads first and all writes after, or move the writes into `requestAnimationFrame`. Consecutive style writes alone are fine: the browser batches them until the next read. A bare `el.offsetHeight;` used to restart a transition is deliberate and not reported.",
  },
  create: (context: RuleContext) => {
    const reported = new WeakSet<EsTreeNode>();
    return {
      BlockStatement(node: EsTreeNode) {
        const accesses: LayoutAccess[] = [];
        for (const statement of node.body ?? []) {
          if (!isDeliberateReflow(statement)) collectAccesses(statement, accesses);
        }
        const read = findThrashingRead(accesses, isRepeatedBody(node));
        if (!read || reported.has(read.node)) return;
        reported.add(read.node);
        context.report({
          node: read.node,
          message: "Layout read between style writes forces a synchronous reflow — read layout first, then write styles",
        });
      },
    };
  },
});
