import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "hook registered inside another hook's callback (instance is active)",
      code: `import { onMounted, onUnmounted } from "vue";\nexport function useResize() {\n  onMounted(() => {\n    window.addEventListener("resize", update);\n    onUnmounted(() => window.removeEventListener("resize", update));\n  });\n}\n`,
    },
    {
      name: "inject called in setup, its value used in the timer",
      code: `import { inject } from "vue";\nexport function useToast() {\n  const bus = inject("bus");\n  setTimeout(() => bus.emit("ready"), 100);\n}\n`,
    },
    {
      name: "synchronous array callback in setup",
      code: `import { onUnmounted } from "vue";\nexport function useCleanups(stops: (() => void)[]) {\n  stops.forEach((stop) => onUnmounted(stop));\n}\n`,
    },
    {
      name: "immediate watch callback (first run is in setup)",
      code: `import { watch, onUnmounted } from "vue";\nexport function useOnce(source) {\n  watch(source, () => {\n    onUnmounted(release);\n  }, { immediate: true });\n}\n`,
    },
    {
      name: "inject through app.runWithContext",
      code: `import { inject } from "vue";\nexport function later(app) {\n  setTimeout(() => app.runWithContext(() => inject("store")), 0);\n}\n`,
    },
    {
      name: "guarded by getCurrentInstance()",
      code: `import { getCurrentInstance, nextTick, onUnmounted } from "vue";\nexport function useLater() {\n  nextTick(() => {\n    if (getCurrentInstance()) onUnmounted(stop);\n  });\n}\n`,
    },
    {
      name: "a destructured provide parameter is not Vue's provide",
      code: `export function register(loader) {\n  loader.then(({ provide }) => provide("plugin", true));\n}\n`,
    },
    {
      name: "a hook defined but not called in the callback",
      code: `import { onMounted } from "vue";\nexport function useLazy() {\n  onMounted(() => {\n    requestAnimationFrame(draw);\n  });\n}\n`,
    },
  ],
  invalid: [
    {
      name: "hook registered in setTimeout",
      code: `import { onMounted } from "vue";\nexport function useDelayed() {\n  setTimeout(() => {\n    onMounted(start);\n  }, 100);\n}\n`,
    },
    {
      name: "provide in a promise reaction",
      code: `import { provide } from "vue";\nexport function useConfig() {\n  loadConfig().then((config) => {\n    provide("config", config);\n  });\n}\n`,
    },
    {
      name: "useRoute in an event listener",
      filename: "src/components/Nav.vue",
      code: `<script setup lang="ts">\nimport { useRoute } from "vue-router";\nwindow.addEventListener("popstate", () => {\n  const route = useRoute();\n  track(route.path);\n});\n</script>\n`,
    },
    {
      name: "inject in nextTick",
      code: `import { inject, nextTick } from "vue";\nexport function useFocus() {\n  nextTick(() => {\n    const focus = inject("focus");\n    focus?.();\n  });\n}\n`,
    },
    {
      name: "hook in a watch callback",
      code: `import { onUnmounted, watch } from "vue";\nexport function useSubscription(id) {\n  watch(id, (value) => {\n    const off = subscribe(value);\n    onUnmounted(off);\n  });\n}\n`,
    },
    {
      name: "window.setTimeout member form, auto-imported hook",
      filename: "src/components/Banner.vue",
      code: `<script setup>\nwindow.setTimeout(() => onBeforeUnmount(hide), 500);\n</script>\n`,
    },
  ],
};

export default cases;
