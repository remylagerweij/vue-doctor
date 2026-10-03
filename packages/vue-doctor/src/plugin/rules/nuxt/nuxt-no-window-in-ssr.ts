import { getFilename, isFunctionNode } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const SSR_UNSAFE_GLOBALS = new Set(["window", "document", "navigator", "localStorage", "sessionStorage"]);

// Lifecycle hooks (and browser-only helpers) whose callbacks never run during SSR.
const CLIENT_ONLY_CALLBACK_HOOKS = new Set([
  "onMounted",
  "onBeforeUnmount",
  "onUnmounted",
  "onUpdated",
  "onBeforeUpdate",
  "onActivated",
  "onDeactivated",
  "onNuxtReady",
  "useEventListener",
]);

const CLIENT_FILE_PATTERN = /\.client\.(?:vue|[cm]?[jt]sx?)$/;

const isFlag = (node: EsTreeNode | undefined, owner: "import.meta" | "process", name: string): boolean => {
  if (node?.type !== "MemberExpression" || node.computed) return false;
  if (node.property?.type !== "Identifier" || node.property.name !== name) return false;
  const objectNode = node.object;
  return owner === "process"
    ? objectNode?.type === "Identifier" && objectNode.name === "process"
    : objectNode?.type === "MetaProperty" && objectNode.meta?.name === "import" && objectNode.property?.name === "meta";
};

const isClientFlag = (node: EsTreeNode | undefined): boolean =>
  isFlag(node, "import.meta", "client") || isFlag(node, "import.meta", "browser") || isFlag(node, "process", "client");

const isServerFlag = (node: EsTreeNode | undefined): boolean =>
  isFlag(node, "import.meta", "server") || isFlag(node, "process", "server");

// `typeof window` / `typeof document` ... style checks.
const isTypeofGlobal = (node: EsTreeNode | undefined): boolean =>
  node?.type === "UnaryExpression" &&
  node.operator === "typeof" &&
  node.argument?.type === "Identifier" &&
  SSR_UNSAFE_GLOBALS.has(node.argument.name);

const isUndefinedLiteral = (node: EsTreeNode | undefined): boolean =>
  (node?.type === "Literal" && node.value === "undefined") ||
  (node?.type === "Identifier" && node.name === "undefined");

// Does `test` being truthy imply the code runs in the browser? (`negated` flips the question:
// does `test` being falsy imply the browser.)
const impliesBrowser = (test: EsTreeNode | undefined, negated: boolean): boolean => {
  if (!test) return false;
  if (test.type === "UnaryExpression" && test.operator === "!") return impliesBrowser(test.argument, !negated);
  if (test.type === "LogicalExpression") {
    // `a && b` truthy => both truthy; `a || b` falsy => both falsy.
    const combinesAll = (test.operator === "&&") !== negated;
    if (combinesAll) {
      return impliesBrowser(test.left, negated) || impliesBrowser(test.right, negated);
    }
    return impliesBrowser(test.left, negated) && impliesBrowser(test.right, negated);
  }
  if (isClientFlag(test)) return !negated;
  if (isServerFlag(test)) return negated;
  if (test.type === "BinaryExpression") {
    const isEquality = test.operator === "===" || test.operator === "==";
    const isInequality = test.operator === "!==" || test.operator === "!=";
    if (!isEquality && !isInequality) return false;
    const typeofSide = isTypeofGlobal(test.left) ? test.left : isTypeofGlobal(test.right) ? test.right : undefined;
    const otherSide = typeofSide === test.left ? test.right : test.left;
    if (!typeofSide || !isUndefinedLiteral(otherSide)) return false;
    // typeof window !== "undefined" is browser when truthy; === "undefined" is browser when falsy.
    return isInequality !== negated;
  }
  return false;
};

const alwaysExits = (statement: EsTreeNode | undefined): boolean => {
  if (!statement) return false;
  if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") return true;
  if (statement.type === "BlockStatement") return alwaysExits(statement.body?.[statement.body.length - 1]);
  return false;
};

// Is `node` inside a region that only runs in the browser?
const isInClientOnlyScope = (node: EsTreeNode): boolean => {
  let child: EsTreeNode = node;
  for (let current = node.parent; current; child = current, current = current.parent) {
    if (current.type === "IfStatement" || current.type === "ConditionalExpression") {
      if (child === current.consequent && impliesBrowser(current.test, false)) return true;
      if (child === current.alternate && impliesBrowser(current.test, true)) return true;
    }
    if (current.type === "LogicalExpression" && child === current.right) {
      if (current.operator === "&&" && impliesBrowser(current.left, false)) return true;
      if (current.operator === "||" && impliesBrowser(current.left, true)) return true;
    }
    if (current.type === "BlockStatement" || current.type === "Program") {
      // Early exit: `if (!import.meta.client) return` guards every later statement.
      const body: EsTreeNode[] = current.body ?? [];
      const position = body.indexOf(child);
      for (let index = 0; index < position; index++) {
        const statement = body[index];
        if (
          statement.type === "IfStatement" &&
          !statement.alternate &&
          alwaysExits(statement.consequent) &&
          impliesBrowser(statement.test, true)
        ) {
          return true;
        }
      }
    }
    if (
      isFunctionNode(current) &&
      current.parent?.type === "CallExpression" &&
      current.parent.arguments?.includes(current) &&
      current.parent.callee?.type === "Identifier" &&
      CLIENT_ONLY_CALLBACK_HOOKS.has(current.parent.callee.name)
    ) {
      return true;
    }
  }
  return false;
};

export default defineRule({
  meta: {
    id: "nuxt-no-window-in-ssr",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Guard browser globals with `if (import.meta.client)` or access them inside `onMounted()`",
    agentGuidance: "Browser globals do not exist during SSR. Guard access with `if (import.meta.client)` or move it into `onMounted()`.",
  },
  create: (context: RuleContext): RuleVisitors => {
    // `*.client.vue` / `*.client.ts` files are never rendered or executed on the server.
    if (CLIENT_FILE_PATTERN.test(getFilename(context))) return {};

    return {
      MemberExpression(node: EsTreeNode) {
        if (node.object?.type !== "Identifier" || !SSR_UNSAFE_GLOBALS.has(node.object.name)) return;
        if (isInClientOnlyScope(node)) return;

        context.report({
          node,
          message: `${node.object.name} is not available during SSR — guard with \`if (import.meta.client)\` or use \`onMounted()\``,
        });
      },
    };
  },
});
