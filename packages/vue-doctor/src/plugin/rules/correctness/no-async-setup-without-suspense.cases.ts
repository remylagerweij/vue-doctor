import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "await inside a lifecycle callback",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(async () => { await load(); });\n</script>\n`,
    },
    {
      name: "await inside an event handler declared in script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nasync function submit() { await save(); }\n</script>\n`,
    },
    {
      name: "await inside a method of an Options API component",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { methods: { async load() { await fetch("/a"); } } };\n</script>\n`,
    },
    {
      name: "await inside a function nested in setup()",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { setup() { const run = async () => { await go(); }; return { run }; } };\n</script>\n`,
    },
    {
      name: "top-level await in a plain TypeScript module",
      filename: "src/util.ts",
      code: `export const config = await loadConfig();\n`,
    },
    {
      name: "Nuxt 4 page renders inside NuxtPage's Suspense",
      filename: "app/pages/motoren/[slug].vue",
      code: `<script setup lang="ts">\nconst { data } = await useFetch("/api/motorcycles");\n</script>\n`,
    },
    {
      name: "Nuxt 3 layout renders inside NuxtLayout's Suspense",
      filename: "layouts/default.vue",
      code: `<script setup>\nconst user = await useUser();\n</script>\n`,
    },
    {
      name: "Nuxt app.vue is the root of the Suspense tree",
      filename: "app/app.vue",
      code: `<script setup>\nawait callOnce(() => store.init());\n</script>\n`,
    },
    {
      name: "Nuxt error page",
      filename: "error.vue",
      code: `<script setup>\nconst copy = await loadErrorCopy();\n</script>\n`,
    },
    {
      name: "component fixture in a test directory",
      filename: "tests/fixtures/AsyncChild.vue",
      code: `<script setup>\nconst data = await Promise.resolve(1);\n</script>\n`,
    },
  ],
  invalid: [
    {
      name: "plain Nuxt component outside pages and layouts",
      filename: "app/components/analytics/PriceChart.vue",
      code: `<script setup lang="ts">\nconst { data } = await useFetch("/api/prices");\n</script>\n`,
    },
    {
      name: "component in a pages folder under components",
      filename: "app/components/pages/HomeHero.vue",
      code: `<script setup>\nconst hero = await loadHero();\n</script>\n`,
    },
    {
      name: "top-level await in script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst data = await fetch("/api");\n</script>\n`,
    },
    {
      name: "async setup() method",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { async setup() { await load(); } };\n</script>\n`,
    },
    {
      name: "async arrow assigned to setup",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { setup: async () => { await load(); } };\n</script>\n`,
    },
    {
      name: "every await in an async setup is reported",
      filename: "src/Comp.vue",
      count: 2,
      code: `<script>\nexport default { setup: async function () { const a = await one(); const b = await two(); } };\n</script>\n`,
    },
  ],
};

export default cases;
