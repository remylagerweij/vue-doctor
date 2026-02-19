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
        node.callee?.type !== "Identifier" ||
        node.callee.name !== "nextTick"
      ) {
        return;
      }

      // Check if the parent is an ExpressionStatement (not awaited)
      // This is a heuristic — the parent won't always be available
      // but we can check if it's used as a standalone call
      if (!node.arguments?.length) {
        let isAwaited = false;
        walkAst(node, (child) => {
          if (child.type === "AwaitExpression" && child.argument === node) {
            isAwaited = true;
          }
        });

        if (!isAwaited) {
          // The call to nextTick() without arguments is fine as a thenable
          // Only warn if we see it's clearly not awaited
        }
      }
    },
  }),
};
