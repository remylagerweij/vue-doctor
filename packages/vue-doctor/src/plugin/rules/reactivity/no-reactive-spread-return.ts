import {
  createApiResolver,
  functionNameOf,
  isComponentSetup,
  isComposableName,
  peel,
  type ApiResolver,
  visibleDeclarators,
} from "../../composition-api.js";
import { defineRule } from "../../define-rule.js";
import { getFilename, isFunctionNode } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const REACTIVE_FACTORIES = new Set(["reactive", "shallowReactive"]);

const isStoreSetup = (fn: EsTreeNode): boolean => {
  const call = fn.parent;
  return (
    call?.type === "CallExpression" &&
    call.callee?.type === "Identifier" &&
    call.callee.name === "defineStore" &&
    call.arguments?.[1] === fn
  );
};

export default defineRule({
  meta: {
    id: "no-reactive-spread-return",
    category: "Reactivity",
    defaultSeverity: "off",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "2.5.0",
    help: "Return `...toRefs(state)` (or the reactive object itself) instead of spreading the reactive object",
    agentGuidance:
      "`return { ...state }` from `setup()`, a composable (`useX`) or a Pinia setup store copies the current values of a `reactive()` object into a plain object: the template or caller sees a snapshot that never updates, and a Pinia store treats the copies as non-state. Return `{ ...toRefs(state), other }` so every property stays a ref linked to the reactive object, or return `state` itself and let callers read `state.prop`. Spreading a reactive object anywhere else (building a request payload, cloning) is an intentional snapshot and is not reported.",
  },
  create: (context: RuleContext) => {
    let resolver: ApiResolver | null = null;
    const filename = getFilename(context);

    // A name counts as reactive only when every declaration of it in the file is `reactive(...)`.
    const isReactiveBinding = (name: string, at: EsTreeNode): boolean => {
      const declarations = resolver ? visibleDeclarators(name, at, resolver) : [];
      return (
        declarations.length > 0 &&
        declarations.every((declarator) => {
          const init = peel(declarator.init);
          if (init?.type !== "CallExpression") return false;
          const api = resolver?.resolve(init.callee);
          return Boolean(api && REACTIVE_FACTORIES.has(api.name));
        })
      );
    };

    const isReturningFunction = (fn: EsTreeNode): boolean => {
      if (isComponentSetup(fn, filename) || isStoreSetup(fn)) return true;
      return isComposableName(functionNameOf(fn));
    };

    const checkReturned = (value: EsTreeNode | null | undefined, fn: EsTreeNode): void => {
      const object = peel(value);
      if (object?.type !== "ObjectExpression") return;
      const setupProps = isComponentSetup(fn, filename) && fn.params?.[0]?.type === "Identifier" ? fn.params[0].name : null;
      for (const property of object.properties ?? []) {
        if (property.type !== "SpreadElement") continue;
        const spread = peel(property.argument);
        if (spread?.type !== "Identifier") continue;
        const isProps = spread.name === setupProps;
        if (!isProps && !isReactiveBinding(spread.name, property)) continue;
        context.report({
          node: property,
          message: `Spreading the reactive object \`${spread.name}\` into the returned object copies its current values; they never update. Return \`...toRefs(${spread.name})\` instead`,
        });
      }
    };

    return {
      Program(node: EsTreeNode) {
        resolver = createApiResolver(node);
      },
      ReturnStatement(node: EsTreeNode) {
        let fn: EsTreeNode | null = node.parent;
        while (fn && !isFunctionNode(fn)) fn = fn.parent;
        if (fn && isReturningFunction(fn)) checkReturned(node.argument, fn);
      },
      ArrowFunctionExpression(node: EsTreeNode) {
        if (node.body?.type !== "BlockStatement" && isReturningFunction(node)) checkReturned(node.body, node);
      },
    };
  },
});
