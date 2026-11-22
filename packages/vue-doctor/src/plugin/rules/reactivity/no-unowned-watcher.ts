import {
  createApiResolver,
  findDeferringCall,
  findPrecedingAwait,
  isGuardedByInstanceCheck,
  isInComponentContext,
  isResultUsed,
  type ApiResolver,
} from "../../composition-api.js";
import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const isOnceWatcher = (call: EsTreeNode, name: string): boolean => {
  const options = call.arguments?.[name === "watch" ? 2 : 1];
  return (
    options?.type === "ObjectExpression" &&
    (options.properties ?? []).some(
      (property: EsTreeNode) =>
        property.type === "Property" &&
        !property.computed &&
        property.key?.name === "once" &&
        property.value?.type === "Literal" &&
        property.value.value === true,
    )
  );
};

export default defineRule({
  meta: {
    id: "no-unowned-watcher",
    category: "Reactivity",
    defaultSeverity: "off",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "2.5.0",
    help: "Create the watcher synchronously in setup, or keep its stop handle (`const stop = watch(...)`) and call `stop()` when it is no longer needed",
    agentGuidance:
      "A `watch`/`watchEffect` created synchronously in setup belongs to the component and stops when it unmounts. One created after an `await` or inside a timer, promise, event-listener or watch callback belongs to nothing: it keeps running after the component is gone (a memory leak and stale side effects), and a new one is added every time that code runs. Create the watcher in setup and let it react to state the async code sets, or keep the handle (`const stop = watch(...)`) and call `stop()` in `onUnmounted`, or create it inside an `effectScope().run()` you dispose. Only code that runs for a component is checked (a `.vue` file, a composable `useX`, a component `setup()`); watchers in app bootstrap code (`main.ts`, plugins, module top level), watchers whose handle is kept and `{ once: true }` watchers are not reported.",
  },
  create: (context: RuleContext) => {
    const filename = getFilename(context);
    let resolver: ApiResolver | null = null;
    return {
      Program(node: EsTreeNode) {
        resolver = createApiResolver(node);
      },
      CallExpression(node: EsTreeNode) {
        if (!resolver) return;
        const api = resolver.resolve(node.callee);
        if (api?.kind !== "watcher" || isResultUsed(node) || isOnceWatcher(node, api.name)) return;
        if (isGuardedByInstanceCheck(node) || !isInComponentContext(node, filename)) return;
        const where = findPrecedingAwait(node) ? "after an await" : findDeferringCall(node, resolver);
        if (!where) return;
        const place = where === "after an await" ? where : `in a ${where} callback`;
        context.report({
          node,
          message: `${api.name}() is created ${place}, outside the component's setup, and its stop handle is discarded: it is never stopped and keeps running after unmount`,
        });
      },
    };
  },
});
