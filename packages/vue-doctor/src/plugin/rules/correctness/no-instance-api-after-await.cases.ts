import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "hooks registered before the first await in async setup()",
      code: `import { defineComponent, onMounted } from "vue";\nexport default defineComponent({\n  async setup() {\n    onMounted(start);\n    const data = await load();\n    return { data };\n  },\n});\n`,
    },
    {
      name: "top-level await in <script setup> (the compiler restores the instance)",
      filename: "src/components/Profile.vue",
      code: `<script setup lang="ts">\nimport { onMounted, inject } from "vue";\nconst user = await fetchUser();\nconst theme = inject("theme");\nonMounted(() => track(user));\n</script>\n`,
    },
    {
      name: "await in a branch that returns before the hook",
      code: `import { onUnmounted } from "vue";\nexport async function usePoller(enabled: boolean) {\n  if (!enabled) {\n    await log("disabled");\n    return;\n  }\n  onUnmounted(stop);\n}\n`,
    },
    {
      name: "await in the other arm of an if",
      code: `import { inject } from "vue";\nexport async function useConfig(remote: boolean) {\n  if (remote) {\n    await prefetch();\n  } else {\n    return inject("config");\n  }\n}\n`,
    },
    {
      name: "a local function that happens to be called inject",
      code: `export async function resolve(inject: (key: string) => unknown) {\n  await ready();\n  return inject("service");\n}\n`,
    },
    {
      name: "inject imported from a DI container, not Vue",
      code: `import { inject } from "tsyringe";\nexport async function boot() {\n  await ready();\n  return inject("Logger");\n}\n`,
    },
    {
      name: "Nuxt plugin (Nuxt restores its context after await)",
      filename: "plugins/auth.ts",
      code: `export default defineNuxtPlugin(async () => {\n  await initAuth();\n  const theme = inject("theme");\n  return { provide: { theme } };\n});\n`,
    },
    {
      name: "guarded by getCurrentInstance()",
      code: `import { getCurrentInstance, onUnmounted } from "vue";\nexport async function useStream() {\n  const stream = await open();\n  if (getCurrentInstance()) onUnmounted(() => stream.close());\n  return stream;\n}\n`,
    },
    {
      name: "hook in a nested synchronous function of an async function",
      code: `import { onMounted } from "vue";\nexport async function load() {\n  await ready();\n  return () => onMounted(start);\n}\n`,
    },
    {
      name: "inject inside an awaited expression's own call (runs before suspending)",
      code: `import { inject } from "vue";\nexport async function useApi() {\n  const client = await connect(inject("baseUrl"));\n  return client;\n}\n`,
    },
    {
      name: "useRouter auto-imported by Nuxt (Nuxt's own, context-safe version)",
      filename: "pages/form.vue",
      code: `<script setup lang="ts">\nasync function submit() {\n  await save();\n  await useRouter().push("/done");\n}\n</script>\n`,
    },
  ],
  invalid: [
    {
      name: "async composable registers a hook after await",
      code: `import { onUnmounted } from "vue";\nexport async function useData() {\n  const data = await fetchData();\n  onUnmounted(() => cleanup(data));\n  return data;\n}\n`,
    },
    {
      name: "async setup() registers onMounted after await",
      code: `import { defineComponent, onMounted } from "vue";\nexport default defineComponent({\n  async setup() {\n    const data = await load();\n    onMounted(() => render(data));\n    return { data };\n  },\n});\n`,
    },
    {
      name: "event handler in <script setup> calls useRouter after await",
      filename: "src/pages/Checkout.vue",
      code: `<script setup lang="ts">\nimport { useRouter } from "vue-router";\nasync function submit() {\n  await save();\n  const router = useRouter();\n  router.push("/done");\n}\n</script>\n`,
    },
    {
      name: "provide with an awaited value",
      code: `import { defineComponent, provide } from "vue";\nexport default defineComponent({\n  async setup() {\n    provide("user", await fetchUser());\n  },\n});\n`,
    },
    {
      name: "hook registered after await inside an async onMounted callback",
      code: `import { onMounted, onUnmounted } from "vue";\nexport function useSocket() {\n  onMounted(async () => {\n    const socket = await connect();\n    onUnmounted(() => socket.close());\n  });\n}\n`,
    },
    {
      name: "after a for await loop",
      code: `import { inject } from "vue";\nexport async function useStream(stream: AsyncIterable<string>) {\n  for await (const chunk of stream) buffer(chunk);\n  return inject("sink");\n}\n`,
    },
    {
      name: "aliased import after a try/catch await",
      code: `import { onBeforeUnmount as beforeUnmount, inject } from "vue";\nexport async function useTimer() {\n  try {\n    await warmUp();\n  } catch {}\n  beforeUnmount(stop);\n  return inject("clock");\n}\n`,
      count: 2,
    },
    {
      name: "useI18n imported from vue-i18n after await",
      code: `import { useI18n } from "vue-i18n";\nexport async function useLabels() {\n  await loadMessages();\n  const { t } = useI18n();\n  return t;\n}\n`,
    },
  ],
};

export default cases;
