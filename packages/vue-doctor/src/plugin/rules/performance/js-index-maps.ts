import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { collectNamesBoundWithin, findEnclosingLoop, getMethodName, getRootName, referencesAnyName, unwrapExpression } from "./helpers.js";

const LOOKUP_METHODS = new Set(["find", "findIndex", "findLast", "findLastIndex"]);
const EQUALITY_OPERATORS = new Set(["===", "=="]);

const getReturnedExpression = (fn: EsTreeNode): EsTreeNode | null => {
  if (fn.body?.type !== "BlockStatement") return fn.body ?? null;
  const statements = fn.body.body ?? [];
  return statements.length === 1 && statements[0].type === "ReturnStatement" ? statements[0].argument : null;
};

// `(user) => user.id === id`: one side reads the item, the other side does not.
const isKeyEqualityPredicate = (callback: EsTreeNode | undefined): boolean => {
  if (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression") return false;
  const item = callback.params?.[0];
  if (item?.type !== "Identifier") return false;
  const comparison = unwrapExpression(getReturnedExpression(callback));
  if (comparison?.type !== "BinaryExpression" || !EQUALITY_OPERATORS.has(comparison.operator)) return false;
  const itemName = new Set([item.name]);
  const leftReadsItem = referencesAnyName(comparison.left, itemName);
  const rightReadsItem = referencesAnyName(comparison.right, itemName);
  return leftReadsItem !== rightReadsItem;
};

const isNonArrayInit = (init: EsTreeNode | null | undefined): boolean => {
  const expression = unwrapExpression(init);
  if (!expression) return false;
  if (expression.type === "NewExpression") return !(expression.callee?.type === "Identifier" && expression.callee.name === "Array");
  if (expression.type === "Literal") return typeof expression.value === "string";
  return expression.type === "TemplateLiteral" || expression.type === "ObjectExpression";
};

export default defineRule({
  meta: {
    id: "js-index-maps",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Build a `Map` indexed by the search key before the loop for O(1) lookups",
    agentGuidance:
      "Reported when a loop searches the same array on every iteration with a key-equality predicate (`find(x => x.id === id)`). Build a `Map` keyed by that field once before the loop and use `map.get(key)` instead. Searches whose array changes per iteration, or whose predicate is not a key comparison, are left alone.",
  },
  create: (context: RuleContext) => {
    const nonArrayNames = new Set<string>();
    const boundNamesByLoop = new WeakMap<EsTreeNode, Set<string>>();

    const isBoundInLoop = (loop: EsTreeNode, name: string): boolean => {
      let names = boundNamesByLoop.get(loop);
      if (!names) {
        names = collectNamesBoundWithin(loop);
        boundNamesByLoop.set(loop, names);
      }
      return names.has(name);
    };

    return {
      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type === "Identifier" && isNonArrayInit(node.init)) nonArrayNames.add(node.id.name);
      },
      CallExpression(node: EsTreeNode) {
        const methodName = getMethodName(node);
        if (!methodName || !LOOKUP_METHODS.has(methodName)) return;
        if (!isKeyEqualityPredicate(node.arguments?.[0])) return;

        const loop = findEnclosingLoop(node);
        if (!loop) return;

        const receiver = unwrapExpression(node.callee.object);
        const rootName = getRootName(receiver);
        if (rootName === null) return;
        if (rootName !== "this" && isBoundInLoop(loop, rootName)) return;
        if (receiver?.type === "Identifier" && nonArrayNames.has(rootName)) return;

        context.report({
          node,
          message: `array.${methodName}() by key inside a loop is O(n*m) — build a Map keyed by that field before the loop`,
        });
      },
    };
  },
});
