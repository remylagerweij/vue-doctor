import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "watcher in the setup of a component built inside a promise callback",
      code: `import { defineAsyncComponent, defineComponent, watch } from "vue";\nexport const Lazy = defineAsyncComponent(() =>\n  fetchSchema().then(() =>\n    defineComponent({\n      setup() {\n        watch(n, log);\n        return {};\n      },\n    }),\n  ),\n);\n`,
    },
    {
      name: "watcher created synchronously in a composable",
      code: `import { watch } from "vue";\nexport function useSearch(query) {\n  watch(query, run);\n}\n`,
    },
    {
      name: "stop handle kept after await",
      code: `import { watch } from "vue";\nexport async function useLive(source) {\n  await ready();\n  const stop = watch(source, sync);\n  return stop;\n}\n`,
    },
    {
      name: "once watcher in a timer stops itself",
      code: `import { watch } from "vue";\nexport function useFirstChange(source) {\n  setTimeout(() => {\n    watch(source, report, { once: true });\n  }, 0);\n}\n`,
    },
    {
      name: "watcher in onMounted belongs to the component",
      code: `import { onMounted, watch } from "vue";\nexport function useChart(data) {\n  onMounted(() => {\n    watch(data, redraw);\n  });\n}\n`,
    },
    {
      name: "module-level watcher (app lifetime by design)",
      code: `import { watch } from "vue";\nimport { settings } from "./settings";\nwatch(settings, persist, { deep: true });\n`,
    },
    {
      name: "watcher created inside effectScope().run in a timer",
      code: `import { effectScope, watch } from "vue";\nconst scope = effectScope();\nexport function useLater(source) {\n  setTimeout(() => scope.run(() => {\n    watch(source, log);\n  }), 0);\n}\n`,
    },
    {
      name: "top-level await in <script setup>",
      filename: "src/pages/Report.vue",
      code: `<script setup lang="ts">\nimport { watchEffect } from "vue";\nconst report = await loadReport();\nwatchEffect(() => render(report));\n</script>\n`,
    },
    {
      name: "stop handle stored on an object in a promise callback",
      code: `import { watch } from "vue";\nexport function useTracked(source, registry) {\n  load().then(() => {\n    registry.stop = watch(source, sync);\n  });\n}\n`,
    },
    {
      name: "app bootstrap watcher after await (vben bootstrap.ts, app lifetime)",
      filename: "src/bootstrap.ts",
      code: `import { createApp, watchEffect } from "vue";\nexport async function bootstrap(namespace: string) {\n  const app = createApp(App);\n  await router.isReady();\n  watchEffect(() => {\n    document.title = String(router.currentRoute.value.meta.title ?? namespace);\n  });\n  app.mount("#app");\n}\n`,
    },
    {
      name: "router guard registered in a plugin, promise callback",
      filename: "src/plugins/analytics.ts",
      code: `import { watch } from "vue";\nexport function installAnalytics(router) {\n  router.isReady().then(() => {\n    watch(router.currentRoute, track);\n  });\n}\n`,
    },
  ],
  invalid: [
    {
      name: "watch after await in an async composable",
      code: `import { watch } from "vue";\nexport async function useSearch(query) {\n  await init();\n  watch(query, run);\n}\n`,
    },
    {
      name: "watchEffect in setTimeout",
      code: `import { watchEffect } from "vue";\nexport function useLog(value) {\n  setTimeout(() => {\n    watchEffect(() => console.log(value.value));\n  }, 100);\n}\n`,
    },
    {
      name: "watcher created in another watcher's callback",
      code: `import { watch } from "vue";\nexport function useNested(a, b) {\n  watch(a, () => {\n    watch(b, sync);\n  });\n}\n`,
    },
    {
      name: "watcher in a promise reaction",
      filename: "src/components/Feed.vue",
      code: `<script setup lang="ts">\nimport { watch } from "vue";\nfetchFeed().then((feed) => {\n  watch(() => feed.items, render);\n});\n</script>\n`,
    },
    {
      name: "voided watcher after await in an event handler",
      filename: "src/components/Editor.vue",
      code: `<script setup>\nasync function open() {\n  const doc = await load();\n  void watchEffect(() => save(doc));\n}\n</script>\n`,
    },
  ],
};

export default cases;
