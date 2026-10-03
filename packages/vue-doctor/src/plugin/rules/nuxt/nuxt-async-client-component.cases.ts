import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "synchronous setup",
      code: `import { defineComponent } from "vue";\nexport default defineComponent({ setup() { return {}; } });\n`,
    },
    {
      name: "async method that is not setup",
      code: `import { defineComponent } from "vue";\nexport default defineComponent({ methods: { async load() { await fetch("/a"); } } });\n`,
    },
    {
      name: "defineNuxtComponent supports async setup",
      code: `export default defineNuxtComponent({ async setup() { const data = await $fetch("/api/a"); return { data }; } });\n`,
    },
    {
      name: "script setup component",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst data = await useFetch("/api/a");\n</script>\n`,
    },
  ],
  invalid: [
    {
      name: "async setup method",
      code: `import { defineComponent } from "vue";\nexport default defineComponent({ async setup() { await load(); return {}; } });\n`,
    },
    {
      name: "async arrow setup",
      code: `import { defineComponent } from "vue";\nexport default defineComponent({ setup: async () => { await load(); return {}; } });\n`,
    },
    {
      name: "async function expression setup",
      code: `import { defineComponent } from "vue";\nexport default defineComponent({ name: "A", setup: async function () { return {}; } });\n`,
    },
  ],
};

export default cases;
