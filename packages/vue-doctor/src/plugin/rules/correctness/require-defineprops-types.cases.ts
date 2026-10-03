import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "type-based declaration",
      filename: "src/Comp.vue",
      code: `<script setup lang="ts">\ndefineProps<{ title: string }>();\n</script>\n`,
    },
    {
      name: "interface-based declaration",
      filename: "src/Comp.vue",
      code: `<script setup lang="ts">\ninterface Props { title: string }\nconst { title } = defineProps<Props>();\n</script>\n`,
    },
    {
      name: "runtime object declaration with validators",
      filename: "src/Comp.vue",
      code: `<script setup>\ndefineProps({ title: { type: String, required: true } });\n</script>\n`,
    },
    {
      name: "withDefaults around a typed declaration",
      filename: "src/Comp.vue",
      code: `<script setup lang="ts">\nwithDefaults(defineProps<{ size?: string }>(), { size: "md" });\n</script>\n`,
    },
  ],
  invalid: [
    {
      name: "array of prop names",
      filename: "src/Comp.vue",
      code: `<script setup>\ndefineProps(["title", "size"]);\n</script>\n`,
    },
    {
      name: "array declaration bound to a variable",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst props = defineProps(["title"]);\n</script>\n`,
    },
    {
      name: "no declaration at all",
      filename: "src/Comp.vue",
      code: `<script setup>\ndefineProps();\n</script>\n`,
    },
  ],
};

export default cases;
