import { isSpecificCall, WALK_STOP, walkAst } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const MUTATING_ARRAY_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse"]);

// Array methods that return a new array, so mutating their result never touches reactive state.
const FRESH_ARRAY_METHODS = new Set(["slice", "filter", "map", "concat", "flat", "flatMap", "toSorted", "toReversed"]);

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
        // Arrays created inside the getter (`const out = []`) may be mutated freely.
        const freshLocals = new Set<string>();
        const isFreshArray = (target: EsTreeNode | null | undefined): boolean => {
          if (!target) return false;
          if (target.type === "ArrayExpression") return true;
          if (target.type === "Identifier") return freshLocals.has(target.name);
          if (target.type !== "CallExpression" || target.callee?.type !== "MemberExpression") return false;
          const method = target.callee.property?.name;
          if (FRESH_ARRAY_METHODS.has(method)) return true;
          // `sort`/`reverse` return their (possibly fresh) receiver.
          return (method === "sort" || method === "reverse") && isFreshArray(target.callee.object);
        };

        walkAst(astNode, (child) => {
          if (child.type === "VariableDeclarator" && child.id?.type === "Identifier" && isFreshArray(child.init)) {
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
            if (MUTATING_ARRAY_METHODS.has(method) && !isFreshArray(child.callee.object)) {
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
