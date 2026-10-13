import { createLoopAwareVisitors } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const ARRAY_RETURNING_METHODS = new Set(["filter", "map", "flatMap", "flat", "split", "toSorted", "toReversed", "toSpliced"]);
const ARRAY_STATIC_CALLS = new Set(["Array.from", "Array.of", "Object.keys", "Object.values", "Object.entries"]);
const REF_FACTORIES = new Set(["ref", "shallowRef"]);
const SMALL_LITERAL_MAX_ELEMENTS = 16;
const GROWING_METHODS = new Set(["push", "unshift", "splice", "concat"]);
const EXPRESSION_WRAPPERS = new Set(["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion"]);

const unwrap = (node: EsTreeNode | null | undefined): EsTreeNode | null | undefined => {
  let current = node;
  while (current && EXPRESSION_WRAPPERS.has(current.type)) current = current.expression;
  return current;
};

// TS annotations that name an array type: `string[]`, `Array<string>`, `readonly string[]`.
const isArrayTypeNode = (typeNode: EsTreeNode | null | undefined): boolean => {
  if (!typeNode) return false;
  if (typeNode.type === "TSArrayType") return true;
  if (typeNode.type === "TSTypeOperator") return isArrayTypeNode(typeNode.typeAnnotation);
  if (typeNode.type === "TSTypeReference" && typeNode.typeName?.type === "Identifier") {
    return typeNode.typeName.name === "Array" || typeNode.typeName.name === "ReadonlyArray";
  }
  return false;
};

const getAnnotation = (identifier: EsTreeNode): EsTreeNode | undefined => identifier.typeAnnotation?.typeAnnotation;

const getStaticCallName = (callee: EsTreeNode | undefined): string | null =>
  callee?.type === "MemberExpression" &&
  !callee.computed &&
  callee.object?.type === "Identifier" &&
  callee.property?.type === "Identifier"
    ? `${callee.object.name}.${callee.property.name}`
    : null;

const isSmallLiteral = (node: EsTreeNode | null | undefined): boolean =>
  node?.type === "ArrayExpression" &&
  node.elements.length <= SMALL_LITERAL_MAX_ELEMENTS &&
  !node.elements.some((element: EsTreeNode | null) => element?.type === "SpreadElement");

// `list` or `list.value` → "list".
const getArrayName = (node: EsTreeNode | null | undefined): string | null => {
  const expression = unwrap(node);
  if (expression?.type === "Identifier") return expression.name;
  if (expression?.type === "MemberExpression" && expression.object?.type === "Identifier") return expression.object.name;
  return null;
};

export default defineRule({
  meta: {
    id: "js-set-map-lookups",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Convert the array to a `Set` before the loop for O(1) lookups instead of O(n)",
    agentGuidance:
      "Convert the array used for `includes`/`indexOf` lookups inside the loop into a `Set` created once before the loop. Small constant lists (an array literal of up to 16 elements that is never grown) are not reported: a linear scan over them is as fast as hashing.",
  },
  create: (context: RuleContext) => {
    // Without type information the receiver is only treated as an array when its array-ness is
    // evident from the file: an array literal, an array-producing call, or an identifier declared
    // (and never redeclared) as one. `string.includes()` and unknown receivers are left alone.
    const declaredAsArray = new Map<string, boolean>();
    const arrayRefs = new Set<string>();
    const smallLiteralNames = new Set<string>();
    const grownNames = new Set<string>();
    const candidates: { node: EsTreeNode; methodName: string; receiverName: string | null }[] = [];

    const recordDeclaration = (name: string, isArray: boolean): void => {
      declaredAsArray.set(name, (declaredAsArray.get(name) ?? true) && isArray);
    };

    const isArrayExpression = (node: EsTreeNode | null | undefined): boolean => {
      const expression = unwrap(node);
      if (!expression) return false;
      switch (expression.type) {
        case "ArrayExpression":
          return true;
        case "NewExpression":
          return expression.callee?.type === "Identifier" && expression.callee.name === "Array";
        case "Identifier":
          // A ref holding an array is only an array through `.value`.
          return declaredAsArray.get(expression.name) === true && !arrayRefs.has(expression.name);
        case "MemberExpression":
          return (
            !expression.computed &&
            expression.property?.type === "Identifier" &&
            expression.property.name === "value" &&
            expression.object?.type === "Identifier" &&
            arrayRefs.has(expression.object.name) &&
            declaredAsArray.get(expression.object.name) === true
          );
        case "CallExpression": {
          const staticName = getStaticCallName(expression.callee);
          if (staticName && ARRAY_STATIC_CALLS.has(staticName)) return true;
          return (
            expression.callee?.type === "MemberExpression" &&
            !expression.callee.computed &&
            expression.callee.property?.type === "Identifier" &&
            ARRAY_RETURNING_METHODS.has(expression.callee.property.name)
          );
        }
        default:
          return false;
      }
    };

    const recordParam = (param: EsTreeNode): void => {
      const target = param.type === "AssignmentPattern" ? param.left : param;
      if (target?.type !== "Identifier") return;
      recordDeclaration(target.name, isArrayTypeNode(getAnnotation(target)) || isArrayExpression(param.right));
    };

    const visitFunction = (node: EsTreeNode): void => {
      for (const param of node.params ?? []) recordParam(param);
    };

    const loopVisitors = createLoopAwareVisitors({
      CallExpression(node: EsTreeNode) {
        if (node.callee?.type !== "MemberExpression" || node.callee.property?.type !== "Identifier") return;
        const methodName = node.callee.property.name;
        if (methodName !== "includes" && methodName !== "indexOf") return;
        if (!isArrayExpression(node.callee.object)) return;
        candidates.push({ node, methodName, receiverName: getArrayName(node.callee.object) });
      },
    });

    const recordGrowth = (node: EsTreeNode): void => {
      const target = unwrap(node);
      if (target?.type === "Identifier") grownNames.add(target.name);
      else if (target?.type === "MemberExpression" && target.object?.type === "Identifier") grownNames.add(target.object.name);
    };

    return {
      ...loopVisitors,
      "CallExpression:exit"(node: EsTreeNode) {
        const callee = node.callee;
        if (callee?.type !== "MemberExpression" || callee.property?.type !== "Identifier") return;
        if (GROWING_METHODS.has(callee.property.name)) recordGrowth(callee.object);
      },
      AssignmentExpression(node: EsTreeNode) {
        recordGrowth(node.left?.type === "MemberExpression" && node.left.property?.name === "length" ? node.left.object : node.left);
      },
      "Program:exit"() {
        for (const { node, methodName, receiverName } of candidates) {
          if (receiverName !== null && smallLiteralNames.has(receiverName) && !grownNames.has(receiverName)) continue;
          context.report({
            node,
            message: `array.${methodName}() in a loop is O(n) per call — convert to a Set for O(1) lookups`,
          });
        }
      },
      FunctionDeclaration: visitFunction,
      FunctionExpression: visitFunction,
      ArrowFunctionExpression: visitFunction,
      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type !== "Identifier") return;
        const name = node.id.name;
        const init = unwrap(node.init);

        if (
          init?.type === "CallExpression" &&
          init.callee?.type === "Identifier" &&
          REF_FACTORIES.has(init.callee.name)
        ) {
          const typeArgument = init.typeArguments?.params?.[0] ?? init.typeParameters?.params?.[0];
          recordDeclaration(name, isArrayExpression(init.arguments?.[0]) || isArrayTypeNode(typeArgument));
          arrayRefs.add(name);
          if (isSmallLiteral(unwrap(init.arguments?.[0]))) smallLiteralNames.add(name);
          return;
        }

        recordDeclaration(name, isArrayTypeNode(getAnnotation(node.id)) || isArrayExpression(init));
        if (isSmallLiteral(init)) smallLiteralNames.add(name);
      },
    };
  },
});
