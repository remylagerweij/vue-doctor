import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { getMethodName, isMemberProperty, unwrapExpression } from "./helpers.js";

const ITERATOR_METHODS = new Set(["values", "keys", "entries", "matchAll"]);
const COLLECTION_CLASSES = new Set(["Set", "Map", "ReadonlySet", "ReadonlyMap", "WeakSet", "WeakMap"]);
const REF_FACTORIES = new Set(["ref", "shallowRef", "reactive", "shallowReactive", "readonly"]);

const isCollectionType = (typeNode: EsTreeNode | null | undefined): boolean =>
  typeNode?.type === "TSTypeReference" &&
  typeNode.typeName?.type === "Identifier" &&
  COLLECTION_CLASSES.has(typeNode.typeName.name);

const isCollectionConstruction = (node: EsTreeNode | null | undefined): boolean => {
  const expression = unwrapExpression(node);
  return (
    expression?.type === "NewExpression" &&
    expression.callee?.type === "Identifier" &&
    COLLECTION_CLASSES.has(expression.callee.name)
  );
};

const typeArgumentOf = (call: EsTreeNode): EsTreeNode | undefined =>
  call.typeArguments?.params?.[0] ?? call.typeParameters?.params?.[0];

export default defineRule({
  meta: {
    id: "js-tosorted-immutable",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Use `array.toSorted()` instead of `[...array].sort()`: same cost, clearer intent. Requires an ES2023 build target",
    agentGuidance:
      "This is a readability rewrite, not a speed-up: `toSorted` copies the array just like the spread does. Replace `[...array].sort(compare)` with `array.toSorted(compare)` only when the receiver is a real array (Sets, Maps and iterators have no `toSorted`) and the build target supports ES2023 (Chrome 110, Firefox 115, Safari 16); Vite does not polyfill it. Leave the spread when either is not the case.",
  },
  create: (context: RuleContext) => {
    const collectionNames = new Set<string>();
    const collectionRefs = new Set<string>();
    const candidates: { node: EsTreeNode; argument: EsTreeNode }[] = [];

    const isCollectionSource = (node: EsTreeNode | null | undefined): boolean => {
      const source = unwrapExpression(node);
      if (!source) return false;
      if (isCollectionConstruction(source)) return true;
      if (ITERATOR_METHODS.has(getMethodName(source) ?? "")) return true;
      if (source.type === "Identifier") return collectionNames.has(source.name);
      return (
        isMemberProperty(source, "value") &&
        source.object?.type === "Identifier" &&
        collectionRefs.has(source.object.name)
      );
    };

    const recordParams = (fn: EsTreeNode): void => {
      for (const param of fn.params ?? []) {
        if (param.type === "Identifier" && isCollectionType(param.typeAnnotation?.typeAnnotation)) collectionNames.add(param.name);
      }
    };

    return {
      FunctionDeclaration: recordParams,
      FunctionExpression: recordParams,
      ArrowFunctionExpression: recordParams,
      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type !== "Identifier") return;
        const name = node.id.name;
        const init = unwrapExpression(node.init);
        if (isCollectionType(node.id.typeAnnotation?.typeAnnotation) || isCollectionConstruction(init)) {
          collectionNames.add(name);
          return;
        }
        if (
          init?.type === "CallExpression" &&
          init.callee?.type === "Identifier" &&
          REF_FACTORIES.has(init.callee.name) &&
          (isCollectionConstruction(init.arguments?.[0]) || isCollectionType(typeArgumentOf(init)))
        ) {
          (init.callee.name.endsWith("eactive") || init.callee.name === "readonly" ? collectionNames : collectionRefs).add(name);
        }
      },
      CallExpression(node: EsTreeNode) {
        if (!isMemberProperty(node.callee, "sort")) return;
        const receiver = node.callee.object;
        if (
          receiver?.type === "ArrayExpression" &&
          receiver.elements?.length === 1 &&
          receiver.elements[0]?.type === "SpreadElement"
        ) {
          candidates.push({ node, argument: receiver.elements[0].argument });
        }
      },
      "Program:exit"() {
        for (const { node, argument } of candidates) {
          if (isCollectionSource(argument)) continue;
          context.report({
            node,
            message: "[...array].sort() — array.toSorted() states the copy-and-sort intent directly (ES2023)",
          });
        }
      },
    };
  },
});
