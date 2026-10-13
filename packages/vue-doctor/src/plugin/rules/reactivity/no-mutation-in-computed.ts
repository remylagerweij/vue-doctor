import { isSpecificCall, WALK_STOP, walkAst } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const MUTATING_ARRAY_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse"]);

// Methods whose result is a new array or string list, so mutating it never touches reactive state.
const FRESH_RESULT_METHODS = new Set([
  "slice", "filter", "map", "concat", "flat", "flatMap", "toSorted", "toReversed", "toSpliced", "with", "split", "match", "matchAll",
]);
const FRESH_STATIC_CALLS: Record<string, ReadonlySet<string>> = {
  Object: new Set(["keys", "values", "entries", "fromEntries", "groupBy"]),
  Array: new Set(["from", "of"]),
  JSON: new Set(["parse"]),
  Map: new Set(["groupBy"]),
};
const FRESH_CONSTRUCTORS = new Set(["Map", "Set", "Array", "WeakMap", "WeakSet", "URLSearchParams", "FormData"]);
const FRESH_FUNCTIONS = new Set(["structuredClone"]);
const TRANSPARENT_WRAPPERS = new Set(["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion", "ParenthesizedExpression", "ChainExpression"]);

const peel = (node: EsTreeNode): EsTreeNode => {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type) && current.expression) current = current.expression;
  return current;
};

export default defineRule({
  meta: {
    id: "no-mutation-in-computed",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Keep computed getters pure — move mutations into a method, a `watch` callback or an event handler",
    agentGuidance: "A computed getter must be pure. Move assignments to `.value` and array mutations such as push/sort into a method, event handler or `watch`; if sorting, copy first with `[...list].sort()` or `toSorted()`.",
  },
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, "computed")) return;

      const callback = node.arguments?.[0];
      if (!callback) return;

      const body =
        callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression"
          ? callback.body
          : null;

      if (!body) return;

      const checkForMutations = (astNode: EsTreeNode): boolean => {
        let hasMutation = false;
        // Values created inside the getter (`const out = []`, `new Map()`, `x.filter()`) may be mutated freely.
        const freshLocals = new Set<string>();
        const isFresh = (node: EsTreeNode | null | undefined): boolean => {
          if (!node) return false;
          const target = peel(node);
          switch (target.type) {
            case "ArrayExpression":
            case "ObjectExpression":
              return true;
            case "Identifier":
              return freshLocals.has(target.name);
            case "ConditionalExpression":
              return isFresh(target.consequent) && isFresh(target.alternate);
            case "LogicalExpression":
              return isFresh(target.left) && isFresh(target.right);
            case "NewExpression":
              return target.callee?.type === "Identifier" && FRESH_CONSTRUCTORS.has(target.callee.name);
            case "CallExpression":
              break;
            default:
              return false;
          }
          const callee = target.callee;
          if (callee?.type === "Identifier") return FRESH_FUNCTIONS.has(callee.name);
          if (callee?.type !== "MemberExpression" || callee.computed) return false;
          const method: string = callee.property?.name;
          if (callee.object?.type === "Identifier" && FRESH_STATIC_CALLS[callee.object.name]?.has(method)) return true;
          if (FRESH_RESULT_METHODS.has(method)) return true;
          // `sort`/`reverse` return their receiver; `.get()` of a getter-local Map returns what the getter put there.
          return (method === "sort" || method === "reverse" || method === "get") && isFresh(callee.object);
        };

        walkAst(astNode, (child) => {
          if (child.type === "VariableDeclarator" && child.id?.type === "Identifier" && isFresh(child.init)) {
            freshLocals.add(child.id.name);
          }
          // Check for `.value = ...` assignments and `.value++` / `.value--` updates
          const target =
            child.type === "AssignmentExpression"
              ? child.left
              : child.type === "UpdateExpression"
                ? child.argument
                : null;
          if (
            target?.type === "MemberExpression" &&
            target.property?.type === "Identifier" &&
            target.property.name === "value"
          ) {
            hasMutation = true;
            return WALK_STOP;
          }
          // Check for reactive mutation methods
          if (
            child.type === "CallExpression" &&
            child.callee?.type === "MemberExpression" &&
            child.callee.property?.type === "Identifier"
          ) {
            const method = child.callee.property.name;
            if (MUTATING_ARRAY_METHODS.has(method) && !isFresh(child.callee.object)) {
              hasMutation = true;
              return WALK_STOP;
            }
          }
        });
        return hasMutation;
      };

      if (checkForMutations(body)) {
        context.report({
          node,
          message: "Side effect in computed() — computed properties should be pure. Move mutations to a method or watch",
        });
      }
    },
  }),
});
