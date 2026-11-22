import { createApiResolver, findPrecedingAwait, isGuardedByInstanceCheck, type ApiResolver } from "../../composition-api.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

export default defineRule({
  meta: {
    id: "no-instance-api-after-await",
    category: "Correctness",
    defaultSeverity: "off",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "2.5.0",
    help: "Call lifecycle hooks, `provide`/`inject` and instance composables before the first `await`, then use their results after it",
    agentGuidance:
      "Vue only knows which component is running while setup executes synchronously. After an `await` inside an async function (a composable, an `async setup()`, an event handler, a hook callback) the instance is gone: `onMounted`/`onUnmounted` and other hooks never register, `provide` does nothing, `inject`, `useRoute()`, `useRouter()` and `useI18n()` return undefined or throw. Move the call above the first `await` and keep its result in a variable (`const router = useRouter()` at the top of setup, then `router.push()` after the await), or register the hook synchronously and let it read state the async code fills in. Top-level `await` in `<script setup>` is not reported (the compiler restores the instance there), nor are Nuxt plugins, route middleware, `defineNuxtComponent` setup and `definePageMeta` callbacks (Nuxt restores its context).",
  },
  create: (context: RuleContext) => {
    let resolver: ApiResolver | null = null;
    return {
      Program(node: EsTreeNode) {
        resolver = createApiResolver(node);
      },
      CallExpression(node: EsTreeNode) {
        const api = resolver?.resolve(node.callee);
        if (api?.kind !== "instance") return;
        if (!findPrecedingAwait(node) || isGuardedByInstanceCheck(node)) return;
        context.report({
          node,
          message: `${api.name}() runs after an await, when Vue no longer knows the current component: it has no effect or returns undefined. Call it before the first await`,
        });
      },
    };
  },
});
