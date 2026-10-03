import type { RuleCases } from "../../rule-cases.js";

// The rule fires above 300 lines; statements are repeated to reach a realistic file length.
const statements = (count: number): string =>
  Array.from({ length: count }, (_, index) => `const value${index} = ref(${index});`).join("\n");

const cases: RuleCases = {
  valid: [
    {
      name: "typical small single-file component",
      filename: "src/Small.vue",
      code: `<script setup lang="ts">\nimport { ref } from "vue";\n${statements(40)}\n</script>\n<template><p>{{ value0 }}</p></template>\n`,
    },
    {
      name: "component just under the threshold",
      filename: "src/Almost.vue",
      code: `<script setup>\nimport { ref } from "vue";\n${statements(250)}\n</script>\n`,
    },
    {
      name: "long non-component utility module",
      filename: "src/utils/table.ts",
      code: `import { ref } from "vue";\n${statements(400)}\nexport const total = 1;\n`,
    },
    {
      name: "long module whose default export is a plain object, not defineComponent",
      filename: "src/config.ts",
      code: `import { ref } from "vue";\n${statements(400)}\nexport default { name: "config" };\n`,
    },
  ],
  invalid: [
    {
      name: "very long script setup component",
      filename: "src/Huge.vue",
      code: `<script setup lang="ts">\nimport { ref } from "vue";\n${statements(350)}\n</script>\n`,
    },
    {
      name: "long Options API single-file component",
      filename: "src/Legacy.vue",
      code: `<script>\nimport { ref } from "vue";\n${statements(330)}\nexport default { name: "Legacy" };\n</script>\n`,
    },
    {
      name: "long TypeScript module exporting defineComponent",
      filename: "src/Big.ts",
      code: `import { defineComponent, ref } from "vue";\n${statements(320)}\nexport default defineComponent({ name: "Big" });\n`,
    },
  ],
};

export default cases;
