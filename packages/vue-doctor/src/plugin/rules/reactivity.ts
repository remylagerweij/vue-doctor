import {
  CASCADING_MUTATION_THRESHOLD,
  WATCH_FUNCTIONS,
} from "../constants.js";
import {
  containsFetchCall,
  countMutationCalls,
  getCallbackStatements,
  getWatchCallback,
  getWatchEffectCallback,
  isSpecificCall,
  walkAst,
} from "../helpers.js";
import type { EsTreeNode, Rule, RuleContext } from "../types.js";

export const noFetchInWatch: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, WATCH_FUNCTIONS)) return;

      const isWatchEffect = node.callee.name !== "watch";
      const callback = isWatchEffect ? getWatchEffectCallback(node) : getWatchCallback(node);
      if (!callback) return;

      if (containsFetchCall(callback)) {
        context.report({
          node,
          message: `fetch() inside ${node.callee.name} — use useFetch(), useAsyncData(), or a data-fetching library instead`,
        });
      }
    },
  }),
};

export const noCascadingMutations: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, WATCH_FUNCTIONS)) return;

      const isWatchEffect = node.callee.name !== "watch";
      const callback = isWatchEffect ? getWatchEffectCallback(node) : getWatchCallback(node);
      if (!callback) return;

      const mutationCount = countMutationCalls(callback);
      if (mutationCount >= CASCADING_MUTATION_THRESHOLD) {
        context.report({
          node,
          message: `${mutationCount} reactive mutations in a single ${node.callee.name} — consider using a composable or combining state`,
        });
      }
    },
  }),
};

export const noWatchForComputed: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, "watch") || node.arguments?.length < 2) return;

      const callback = getWatchCallback(node);
      if (!callback) return;

      const statements = getCallbackStatements(callback);
      if (statements.length !== 1) return;

      const statement = statements[0];
      if (
        statement.type === "ExpressionStatement" &&
        statement.expression?.type === "AssignmentExpression" &&
        statement.expression.left?.type === "MemberExpression" &&
        statement.expression.left.property?.type === "Identifier" &&
        statement.expression.left.property.name === "value"
      ) {
        context.report({
          node,
          message: "watch() that only sets a ref — replace with a computed property",
        });
      }
    },
  }),
};

export const noRefFromProp: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, "ref") || !node.arguments?.length) return;

      const initializer = node.arguments[0];
      if (initializer.type !== "MemberExpression") return;

      if (
        initializer.object?.type === "Identifier" &&
        initializer.object.name === "props"
      ) {
        const propName = initializer.property?.name ?? "prop";
        context.report({
          node,
          message: `ref() initialized from props.${propName} — this creates a copy that won't stay in sync. Use computed() or toRef(props, '${propName}') instead`,
        });
      }
    },
  }),
};

export const preferComputed: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (!isSpecificCall(node, "watchEffect")) return;

      const callback = getWatchEffectCallback(node);
      if (!callback) return;

      const statements = getCallbackStatements(callback);
      if (statements.length !== 1) return;

      const statement = statements[0];
      if (
        statement.type === "ExpressionStatement" &&
        statement.expression?.type === "AssignmentExpression" &&
        statement.expression.left?.type === "MemberExpression" &&
        statement.expression.left.property?.type === "Identifier" &&
        statement.expression.left.property.name === "value"
      ) {
        context.report({
          node,
          message: "watchEffect() that only sets a ref — replace with a computed property for better performance",
        });
      }
    },
  }),
};

export const noReactiveReplace: Rule = {
  create: (context: RuleContext) => ({
    AssignmentExpression(node: EsTreeNode) {
      if (node.operator !== "=") return;
      if (node.left?.type !== "Identifier") return;

      // Check if right side is a reactive() call
      if (
        node.right?.type === "CallExpression" &&
        node.right.callee?.type === "Identifier" &&
        node.right.callee.name === "reactive"
      ) {
        context.report({
          node,
          message: `Reassigning reactive variable "${node.left.name}" — use Object.assign(${node.left.name}, newValue) to preserve reactivity`,
        });
      }
    },
  }),
};

export const noMissingAwaitNextTick: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (
        (node.callee?.type === "Identifier" && node.callee.name === "nextTick") ||
        (node.callee?.type === "MemberExpression" &&
          node.callee.property?.type === "Identifier" &&
          node.callee.property.name === "nextTick")
      ) {
        context.report({
          node,
          message: "Missing await on nextTick(). This can lead to race conditions where the DOM is not yet updated when the subsequent code runs.",
        });
      }
    },
  }),
};

export const noReactiveDestructure: Rule = {
  create: (context: RuleContext) => ({
    VariableDeclarator(node: EsTreeNode) {
      if (node.id?.type !== "ObjectPattern" && node.id?.type !== "ArrayPattern") return;
      if (node.init?.type !== "CallExpression") return;

      const callee = node.init.callee;
      if (
        callee?.type === "Identifier" &&
        (callee.name === "reactive" || callee.name === "toRefs")
      ) {
        // toRefs is fine to destructure, only flag reactive
        if (callee.name === "reactive") {
          context.report({
            node,
            message: "Destructuring reactive() loses reactivity — use toRefs() or access properties directly",
          });
        }
      }
    },
  }),
};

export const noMutationInComputed: Rule = {
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
        walkAst(astNode, (child) => {
          // Check for .value = assignments
          if (
            child.type === "AssignmentExpression" &&
            child.left?.type === "MemberExpression" &&
            child.left.property?.type === "Identifier" &&
            child.left.property.name === "value"
          ) {
            hasMutation = true;
          }
          // Check for reactive mutation methods
          if (
            child.type === "CallExpression" &&
            child.callee?.type === "MemberExpression" &&
            child.callee.property?.type === "Identifier"
          ) {
            const method = child.callee.property.name;
            if (["push", "pop", "shift", "unshift", "splice", "sort", "reverse"].includes(method)) {
              hasMutation = true;
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
};
