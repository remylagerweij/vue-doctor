import { LOOP_TYPES } from "../../constants.js";
import { isFunctionNode, walkAst, WALK_SKIP } from "../../helpers.js";
import type { EsTreeNode } from "../../types.js";

export const isMemberProperty = (node: EsTreeNode | null, name: string): boolean =>
  node?.type === "MemberExpression" &&
  node.property?.type === "Identifier" &&
  node.property.name === name;

const LOOP_TYPE_SET = new Set(LOOP_TYPES);

const ITERATION_CALLBACK_METHODS = new Set([
  "map",
  "filter",
  "forEach",
  "flatMap",
  "reduce",
  "reduceRight",
  "some",
  "every",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
]);

const EXPRESSION_WRAPPERS = new Set(["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion", "ParenthesizedExpression"]);

export const unwrapExpression = (node: EsTreeNode | null | undefined): EsTreeNode | null | undefined => {
  let current = node;
  while (current && EXPRESSION_WRAPPERS.has(current.type)) current = current.expression;
  return current;
};

export const getMethodName = (call: EsTreeNode | null | undefined): string | null =>
  call?.type === "CallExpression" &&
  call.callee?.type === "MemberExpression" &&
  !call.callee.computed &&
  call.callee.property?.type === "Identifier"
    ? call.callee.property.name
    : null;

const isRepeatedPartOfLoop = (loop: EsTreeNode, child: EsTreeNode): boolean => {
  if (child === loop.body) return true;
  if (loop.type === "ForInStatement" || loop.type === "ForOfStatement") return false;
  return child === loop.test || child === loop.update;
};

export const isIterationCallback = (fn: EsTreeNode): boolean => {
  const call = fn.parent;
  return (
    call?.type === "CallExpression" &&
    call.callee !== fn &&
    (call.arguments ?? []).includes(fn) &&
    ITERATION_CALLBACK_METHODS.has(getMethodName(call) ?? "")
  );
};

// Innermost loop that re-runs `node` on every iteration, looking through function boundaries.
export const findEnclosingLoop = (node: EsTreeNode): EsTreeNode | null => {
  let child = node;
  for (let current = node.parent; current; child = current, current = current.parent) {
    if (LOOP_TYPE_SET.has(current.type) && isRepeatedPartOfLoop(current, child)) return current;
  }
  return null;
};

// Innermost loop or array-iteration callback that re-runs `node`; other functions end the search.
export const findRepeatingContext = (node: EsTreeNode): EsTreeNode | null => {
  let child = node;
  for (let current = node.parent; current; child = current, current = current.parent) {
    if (LOOP_TYPE_SET.has(current.type) && isRepeatedPartOfLoop(current, child)) return current;
    if (isFunctionNode(current)) return isIterationCallback(current) ? current : null;
  }
  return null;
};

export const collectPatternNames = (pattern: EsTreeNode | null | undefined, names: Set<string>): void => {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      names.add(pattern.name);
      return;
    case "ObjectPattern":
      for (const property of pattern.properties ?? []) {
        collectPatternNames(property.type === "RestElement" ? property.argument : property.value, names);
      }
      return;
    case "ArrayPattern":
      for (const element of pattern.elements ?? []) collectPatternNames(element, names);
      return;
    case "RestElement":
      collectPatternNames(pattern.argument, names);
      return;
    case "AssignmentPattern":
      collectPatternNames(pattern.left, names);
      return;
  }
};

// Names declared or reassigned anywhere inside `scope` (loop head and body included).
export const collectNamesBoundWithin = (scope: EsTreeNode): Set<string> => {
  const names = new Set<string>();
  walkAst(scope, (child) => {
    if (child.type === "VariableDeclarator") collectPatternNames(child.id, names);
    else if (child.type === "AssignmentExpression") collectPatternNames(child.left, names);
    else if (child.type === "UpdateExpression" && child.argument?.type === "Identifier") names.add(child.argument.name);
    else if (isFunctionNode(child)) {
      for (const param of child.params ?? []) collectPatternNames(param, names);
    }
  });
  return names;
};

// `a`, `a.b.c`, `this.a` → the root identifier name (`this` for this); null for anything computed at runtime.
export const getRootName = (node: EsTreeNode | null | undefined): string | null => {
  let current = unwrapExpression(node);
  while (current?.type === "MemberExpression") {
    if (current.computed && current.property?.type !== "Literal") return null;
    current = unwrapExpression(current.object);
  }
  if (current?.type === "Identifier") return current.name;
  if (current?.type === "ThisExpression") return "this";
  return null;
};

// Stable text for simple operands (`a`, `a.b`, `"k"`, `1`), null for anything with runtime behaviour.
export const getSimpleOperandKey = (node: EsTreeNode | null | undefined): string | null => {
  const current = unwrapExpression(node);
  if (!current) return null;
  if (current.type === "Identifier") return current.name;
  if (current.type === "ThisExpression") return "this";
  if (current.type === "Literal") return JSON.stringify(current.value);
  if (current.type === "TemplateLiteral" && (current.expressions ?? []).length === 0) {
    return JSON.stringify(current.quasis?.[0]?.value?.cooked ?? "");
  }
  if (current.type === "MemberExpression" && !current.computed && current.property?.type === "Identifier") {
    const objectKey = getSimpleOperandKey(current.object);
    return objectKey === null ? null : `${objectKey}.${current.property.name}`;
  }
  return null;
};

export const referencesAnyName = (node: EsTreeNode | null | undefined, names: Set<string>): boolean => {
  if (!node || names.size === 0) return false;
  let found = false;
  walkAst(node, (child) => {
    if (found) return WALK_SKIP;
    if (child.type === "MemberExpression" && !child.computed) {
      if (referencesAnyName(child.object, names)) found = true;
      return WALK_SKIP;
    }
    if (child.type === "Property" && !child.computed && !child.shorthand) {
      if (referencesAnyName(child.value, names)) found = true;
      return WALK_SKIP;
    }
    if (child.type === "Identifier" && names.has(child.name)) found = true;
  });
  return found;
};
