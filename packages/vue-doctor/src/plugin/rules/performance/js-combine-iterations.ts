import { CHAINABLE_ITERATION_METHODS } from "../../constants.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { findRepeatingContext, getMethodName, unwrapExpression } from "./helpers.js";

const MIN_CHAIN_LENGTH = 3;
const SMALL_ARRAY_LITERAL_MAX = 8;

const chainableMethodOf = (node: EsTreeNode | null | undefined): string | null => {
  const name = getMethodName(unwrapExpression(node));
  return name && CHAINABLE_ITERATION_METHODS.has(name) ? name : null;
};

const isTypePredicateCallback = (callback: EsTreeNode | undefined): boolean =>
  (callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression") &&
  callback.returnType?.typeAnnotation?.type === "TSTypePredicate";

// `.filter(Boolean)` and `.filter((x): x is T => ...)` after a map only compact its result.
const isCompactingFilter = (call: EsTreeNode): boolean => {
  if (getMethodName(call) !== "filter") return false;
  const callback = call.arguments?.[0];
  return (callback?.type === "Identifier" && callback.name === "Boolean") || isTypePredicateCallback(callback);
};

const isSmallArrayLiteral = (node: EsTreeNode | null | undefined): boolean => {
  const receiver = unwrapExpression(node);
  return (
    receiver?.type === "ArrayExpression" &&
    receiver.elements.length <= SMALL_ARRAY_LITERAL_MAX &&
    !receiver.elements.some((element: EsTreeNode | null) => element?.type === "SpreadElement")
  );
};

export default defineRule({
  meta: {
    id: "js-combine-iterations",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Fuse long `.filter().map().filter()` chains, or chains that run inside a loop, into one `.reduce()` or `for...of` pass",
    agentGuidance:
      "Only chains of three or more iteration methods, or chains evaluated on every iteration of a loop or array callback, are reported. Fuse them into one pass with `for...of` or `.reduce()`, preserving the order of side effects. A single `.map().filter()` over a small array costs microseconds and is better left readable.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!chainableMethodOf(node)) return;
      const outer = node.parent?.type === "MemberExpression" && node.parent.object === node ? node.parent.parent : null;
      if (outer?.callee === node.parent && chainableMethodOf(outer)) return;

      const methods: string[] = [];
      let countedLength = 0;
      let current: EsTreeNode | null | undefined = node;
      while (chainableMethodOf(current)) {
        const call = unwrapExpression(current) as EsTreeNode;
        const inner = call.callee.object;
        methods.unshift(getMethodName(call) as string);
        const compactsAMap = isCompactingFilter(call) && ["map", "flatMap"].includes(chainableMethodOf(inner) ?? "");
        if (!compactsAMap) countedLength++;
        current = inner;
      }
      if (methods.length < 2 || isSmallArrayLiteral(current)) return;

      const isLongChain = countedLength >= MIN_CHAIN_LENGTH;
      const isRepeated = countedLength >= 2 && findRepeatingContext(node) !== null;
      if (!isLongChain && !isRepeated) return;

      const chain = methods.map((method) => `.${method}()`).join("");
      context.report({
        node,
        message: isLongChain
          ? `${chain} walks the array ${methods.length} times — fuse it into a single for...of or .reduce() pass`
          : `${chain} inside a loop allocates an intermediate array on every iteration — fuse it into a single pass`,
      });
    },
  }),
});
