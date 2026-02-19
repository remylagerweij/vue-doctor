import {
  COMPOSABLE_PATTERN,
  FETCH_CALLEE_NAMES,
  FETCH_MEMBER_OBJECTS,
  LOOP_TYPES,
  UPPERCASE_PATTERN,
  WATCH_FUNCTIONS,
} from "./constants.js";
import type { EsTreeNode, RuleVisitors } from "./types.js";

export const walkAst = (node: EsTreeNode, visitor: (child: EsTreeNode) => void): void => {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) {
          walkAst(item, visitor);
        }
      }
    } else if (child && typeof child === "object" && child.type) {
      walkAst(child, visitor);
    }
  }
};

export const isComposableCall = (node: EsTreeNode): boolean =>
  node.type === "CallExpression" &&
  node.callee?.type === "Identifier" &&
  COMPOSABLE_PATTERN.test(node.callee.name);

export const isWatchCall = (node: EsTreeNode): boolean =>
  node.type === "CallExpression" &&
  node.callee?.type === "Identifier" &&
  WATCH_FUNCTIONS.has(node.callee.name);

export const isSpecificCall = (node: EsTreeNode, name: string | Set<string>): boolean =>
  node.type === "CallExpression" &&
  node.callee?.type === "Identifier" &&
  (typeof name === "string" ? node.callee.name === name : name.has(node.callee.name));

export const isUppercaseName = (name: string): boolean => UPPERCASE_PATTERN.test(name);

export const getCallbackBody = (node: EsTreeNode): EsTreeNode | null => {
  if (!node.arguments?.length) return null;
  const callback = node.arguments[node.arguments.length > 1 ? 1 : 0];
  if (callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression") {
    return callback;
  }
  return null;
};

export const getWatchCallback = (node: EsTreeNode): EsTreeNode | null => {
  if (!node.arguments?.length || node.arguments.length < 2) return null;
  const callback = node.arguments[1];
  if (callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression") {
    return callback;
  }
  return null;
};

export const getWatchEffectCallback = (node: EsTreeNode): EsTreeNode | null => {
  if (!node.arguments?.length) return null;
  const callback = node.arguments[0];
  if (callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression") {
    return callback;
  }
  return null;
};

export const getCallbackStatements = (callback: EsTreeNode): EsTreeNode[] => {
  if (callback.body?.type === "BlockStatement") {
    return callback.body.body ?? [];
  }
  return callback.body ? [callback.body] : [];
};

export const containsFetchCall = (node: EsTreeNode): boolean => {
  let didFindFetchCall = false;
  walkAst(node, (child) => {
    if (didFindFetchCall || child.type !== "CallExpression") return;
    if (child.callee?.type === "Identifier" && FETCH_CALLEE_NAMES.has(child.callee.name)) {
      didFindFetchCall = true;
    }
    if (
      child.callee?.type === "MemberExpression" &&
      child.callee.object?.type === "Identifier" &&
      FETCH_MEMBER_OBJECTS.has(child.callee.object.name)
    ) {
      didFindFetchCall = true;
    }
  });
  return didFindFetchCall;
};

export const isSimpleExpression = (node: EsTreeNode | null): boolean => {
  if (!node) return false;
  switch (node.type) {
    case "Identifier":
    case "Literal":
    case "TemplateLiteral":
      return true;
    case "BinaryExpression":
      return isSimpleExpression(node.left) && isSimpleExpression(node.right);
    case "UnaryExpression":
      return isSimpleExpression(node.argument);
    case "MemberExpression":
      return !node.computed;
    case "ConditionalExpression":
      return (
        isSimpleExpression(node.test) &&
        isSimpleExpression(node.consequent) &&
        isSimpleExpression(node.alternate)
      );
    default:
      return false;
  }
};

export const isComponentDeclaration = (node: EsTreeNode): boolean =>
  node.type === "FunctionDeclaration" && Boolean(node.id?.name) && isUppercaseName(node.id.name);

export const createLoopAwareVisitors = (
  innerVisitors: Record<string, (node: EsTreeNode) => void>,
): RuleVisitors => {
  let loopDepth = 0;
  const incrementLoopDepth = (): void => {
    loopDepth++;
  };
  const decrementLoopDepth = (): void => {
    loopDepth--;
  };

  const visitors: RuleVisitors = {};

  for (const loopType of LOOP_TYPES) {
    visitors[loopType] = incrementLoopDepth;
    visitors[`${loopType}:exit`] = decrementLoopDepth;
  }

  for (const [nodeType, handler] of Object.entries(innerVisitors)) {
    visitors[nodeType] = (node: EsTreeNode) => {
      if (loopDepth > 0) handler(node);
    };
  }

  return visitors;
};

export const countMutationCalls = (node: EsTreeNode): number => {
  let mutationCount = 0;
  walkAst(node, (child) => {
    if (child.type !== "ExpressionStatement") return;
    const expression = child.expression;
    if (!expression) return;

    // .value = ...
    if (
      expression.type === "AssignmentExpression" &&
      expression.left?.type === "MemberExpression" &&
      expression.left.property?.type === "Identifier" &&
      expression.left.property.name === "value"
    ) {
      mutationCount++;
    }

    // setXxx() style calls
    if (
      expression.type === "CallExpression" &&
      expression.callee?.type === "Identifier" &&
      /^set[A-Z]/.test(expression.callee.name)
    ) {
      mutationCount++;
    }
  });
  return mutationCount;
};
