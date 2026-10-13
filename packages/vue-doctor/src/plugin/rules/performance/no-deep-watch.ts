import { defineRule } from "../../define-rule.js";
import { isFunctionNode } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { unwrapExpression } from "./helpers.js";

const PRIMITIVE_TYPE_NODES = new Set([
  "TSStringKeyword", "TSNumberKeyword", "TSBooleanKeyword", "TSBigIntKeyword", "TSSymbolKeyword",
  "TSLiteralType", "TSNullKeyword", "TSUndefinedKeyword", "TSTemplateLiteralType",
]);
const PRIMITIVE_CONSTRUCTORS = new Set(["String", "Number", "Boolean", "BigInt", "Symbol"]);
const REF_FACTORIES = new Set(["ref", "shallowRef"]);

const isPrimitiveType = (typeNode: EsTreeNode | null | undefined): boolean => {
  if (!typeNode) return false;
  if (PRIMITIVE_TYPE_NODES.has(typeNode.type)) return true;
  return typeNode.type === "TSUnionType" && (typeNode.types ?? []).every(isPrimitiveType);
};

const isArrayType = (typeNode: EsTreeNode | null | undefined): boolean => {
  if (!typeNode) return false;
  if (typeNode.type === "TSArrayType" || typeNode.type === "TSTupleType") return true;
  if (typeNode.type === "TSTypeOperator") return isArrayType(typeNode.typeAnnotation);
  if (typeNode.type === "TSUnionType") return (typeNode.types ?? []).some(isArrayType);
  return (
    typeNode.type === "TSTypeReference" &&
    typeNode.typeName?.type === "Identifier" &&
    (typeNode.typeName.name === "Array" || typeNode.typeName.name === "ReadonlyArray")
  );
};

const isArrayRuntimeProp = (value: EsTreeNode | null | undefined): boolean => {
  const definition = unwrapExpression(value);
  if (definition?.type === "Identifier") return definition.name === "Array";
  if (definition?.type === "ArrayExpression") return definition.elements.some(isArrayRuntimeProp);
  if (definition?.type !== "ObjectExpression") return false;
  const type = definition.properties?.find(
    (property: EsTreeNode) => property.type === "Property" && property.key?.type === "Identifier" && property.key.name === "type",
  );
  return isArrayRuntimeProp(type?.value);
};

const isPrimitiveRuntimeProp = (value: EsTreeNode | null | undefined): boolean => {
  const definition = unwrapExpression(value);
  if (definition?.type === "Identifier") return PRIMITIVE_CONSTRUCTORS.has(definition.name);
  if (definition?.type === "ArrayExpression") return definition.elements.every(isPrimitiveRuntimeProp);
  if (definition?.type !== "ObjectExpression") return false;
  const type = definition.properties?.find(
    (property: EsTreeNode) => property.type === "Property" && property.key?.type === "Identifier" && property.key.name === "type",
  );
  return isPrimitiveRuntimeProp(type?.value);
};

const isPrimitiveLiteral = (node: EsTreeNode | null | undefined): boolean => {
  const expression = unwrapExpression(node);
  return (
    (expression?.type === "Literal" && (expression.value === null || typeof expression.value !== "object")) ||
    expression?.type === "TemplateLiteral" ||
    (expression?.type === "UnaryExpression" && expression.argument?.type === "Literal")
  );
};

const getReturnedExpression = (fn: EsTreeNode): EsTreeNode | null => {
  if (fn.body?.type !== "BlockStatement") return unwrapExpression(fn.body) ?? null;
  const statements = fn.body.body ?? [];
  return statements.length === 1 && statements[0].type === "ReturnStatement" ? unwrapExpression(statements[0].argument) ?? null : null;
};

export default defineRule({
  meta: {
    id: "no-deep-watch",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Watch the specific properties you need (`() => state.user.name`), limit the traversal with `deep: 1` (Vue 3.5+), or drop `deep` when the source is replaced rather than mutated",
    agentGuidance:
      "`{ deep: true }` traverses the whole source on every trigger, which matters for large arrays or nested objects. Watch the specific properties you need, use a numeric depth such as `deep: 1` (Vue 3.5+), or drop `deep` entirely when the parent replaces the array or object instead of mutating it. Deep watches on primitive sources or on getters that return a literal of plain reads are not reported.",
  },
  create: (context: RuleContext) => {
    const primitiveProps = new Set<string>();
    const arrayProps = new Set<string>();
    const primitiveRefs = new Set<string>();
    const typeLiterals = new Map<string, EsTreeNode>();
    const propsTypeArguments: EsTreeNode[] = [];
    const deepWatches: EsTreeNode[] = [];

    const recordPropType = (name: string, typeNode: EsTreeNode | null | undefined): void => {
      if (isPrimitiveType(typeNode)) primitiveProps.add(name);
      if (isArrayType(typeNode)) arrayProps.add(name);
    };

    const recordTypeLiteralProps = (typeNode: EsTreeNode | null | undefined): void => {
      const literal =
        typeNode?.type === "TSTypeReference" && typeNode.typeName?.type === "Identifier"
          ? typeLiterals.get(typeNode.typeName.name)
          : typeNode;
      const members = literal?.type === "TSTypeLiteral" ? literal.members : literal?.type === "TSInterfaceBody" ? literal.body : null;
      for (const member of members ?? []) {
        if (member.type === "TSPropertySignature" && member.key?.type === "Identifier") {
          recordPropType(member.key.name, member.typeAnnotation?.typeAnnotation);
        }
      }
    };

    const propNameOf = (node: EsTreeNode | null | undefined): string | null => {
      const expression = unwrapExpression(node);
      return expression?.type === "MemberExpression" &&
        !expression.computed &&
        expression.object?.type === "Identifier" &&
        expression.object.name === "props" &&
        expression.property?.type === "Identifier"
        ? expression.property.name
        : null;
    };

    // `props.a`, `state.b.c`, `count.value`: a read that builds nothing and is not a known array prop.
    const isSmallRead = (node: EsTreeNode | null | undefined): boolean => {
      const expression = unwrapExpression(node);
      if (!expression) return false;
      if (expression.type === "Literal") return true;
      if (expression.type === "Identifier") return primitiveRefs.has(expression.name);
      const propName = propNameOf(expression);
      if (propName !== null) return !arrayProps.has(propName);
      return expression.type === "MemberExpression" && !expression.computed && isSmallRead(expression.object);
    };

    const isLiteralOfSmallReads = (expression: EsTreeNode | null): boolean => {
      if (expression?.type === "ObjectExpression") {
        return (expression.properties ?? []).every(
          (property: EsTreeNode) => property.type === "Property" && !property.computed && isSmallRead(property.value),
        );
      }
      if (expression?.type === "ArrayExpression") {
        return (expression.elements ?? []).every((element: EsTreeNode | null) => isSmallRead(element));
      }
      return false;
    };

    const isCheapSource = (source: EsTreeNode | null | undefined): boolean => {
      const expression = unwrapExpression(source);
      if (expression?.type === "Identifier") return primitiveRefs.has(expression.name);
      if (!expression || !isFunctionNode(expression)) return false;
      const returned = getReturnedExpression(expression);
      if (isLiteralOfSmallReads(returned)) return true;
      const propName = propNameOf(returned);
      return propName !== null && primitiveProps.has(propName);
    };

    return {
      TSInterfaceDeclaration(node: EsTreeNode) {
        if (node.id?.type === "Identifier") typeLiterals.set(node.id.name, node.body);
      },
      TSTypeAliasDeclaration(node: EsTreeNode) {
        if (node.id?.type === "Identifier") typeLiterals.set(node.id.name, node.typeAnnotation);
      },
      VariableDeclarator(node: EsTreeNode) {
        const init = unwrapExpression(node.init);
        if (
          node.id?.type === "Identifier" &&
          init?.type === "CallExpression" &&
          init.callee?.type === "Identifier" &&
          REF_FACTORIES.has(init.callee.name) &&
          isPrimitiveLiteral(init.arguments?.[0])
        ) {
          primitiveRefs.add(node.id.name);
        }
      },
      CallExpression(node: EsTreeNode) {
        if (node.callee?.type !== "Identifier") return;
        if (node.callee.name === "defineProps") {
          const typeArgument = node.typeArguments?.params?.[0] ?? node.typeParameters?.params?.[0];
          if (typeArgument) propsTypeArguments.push(typeArgument);
          const runtime = unwrapExpression(node.arguments?.[0]);
          for (const property of runtime?.type === "ObjectExpression" ? runtime.properties : []) {
            if (property.type !== "Property" || property.key?.type !== "Identifier") continue;
            if (isPrimitiveRuntimeProp(property.value)) primitiveProps.add(property.key.name);
            if (isArrayRuntimeProp(property.value)) arrayProps.add(property.key.name);
          }
          return;
        }
        if (node.callee.name !== "watch") return;

        const options = node.arguments?.[2];
        if (options?.type !== "ObjectExpression") return;
        const isDeep = options.properties?.some(
          (prop: EsTreeNode) =>
            prop.type === "Property" &&
            prop.key?.type === "Identifier" &&
            prop.key.name === "deep" &&
            prop.value?.type === "Literal" &&
            prop.value.value === true,
        );
        if (isDeep) deepWatches.push(node);
      },
      "Program:exit"() {
        for (const typeArgument of propsTypeArguments) recordTypeLiteralProps(typeArgument);
        for (const node of deepWatches) {
          if (isCheapSource(node.arguments[0])) continue;
          context.report({
            node,
            message:
              "watch() with { deep: true } traverses the entire source on every change — watch specific properties, use deep: 1 (Vue 3.5+), or drop deep if the source is replaced",
          });
        }
      },
    };
  },
});
