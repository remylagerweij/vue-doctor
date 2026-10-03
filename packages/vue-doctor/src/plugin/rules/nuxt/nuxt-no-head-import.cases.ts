import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "Nuxt auto-import alias",
      code: `import { useHead } from "#imports";\nexport { useHead };\n`,
    },
    {
      name: "unrelated head package",
      code: `import { useMeta } from "vue-meta";\nexport { useMeta };\n`,
    },
    {
      name: "unhead server entry used for SSR utilities",
      code: `import { renderSSRHead } from "@unhead/ssr";\nexport { renderSSRHead };\n`,
    },
    {
      name: "local module with a similar name",
      code: `import { head } from "./unhead-vue";\nexport { head };\n`,
    },
  ],
  invalid: [
    {
      name: "useHead from @unhead/vue",
      code: `import { useHead } from "@unhead/vue";\nexport { useHead };\n`,
    },
    {
      name: "createHead from @vueuse/head",
      code: `import { createHead } from "@vueuse/head";\nexport { createHead };\n`,
    },
    {
      name: "default import from @vueuse/head",
      code: `import head from "@vueuse/head";\nexport { head };\n`,
    },
  ],
};

export default cases;
