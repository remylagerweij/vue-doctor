import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "destructured props with defaults",
      filename: "src/Comp.vue",
      code: `<script setup lang="ts">\nconst { title, size = "md" } = defineProps<{ title: string; size?: string }>();\n</script>\n`,
    },
    {
      name: "bare macro call without a binding",
      filename: "src/Comp.vue",
      code: `<script setup lang="ts">\ndefineProps<{ title: string }>();\n</script>\n`,
    },
    {
      name: "withDefaults wrapper",
      filename: "src/Comp.vue",
      code: `<script setup lang="ts">\nconst props = withDefaults(defineProps<{ size?: string }>(), { size: "md" });\n</script>\n`,
    },
    {
      name: "unrelated function with a similar result name",
      code: `export const props = defineThings();\n`,
    },
  ],
  invalid: [
    {
      name: "props object from a type-only declaration",
      filename: "src/Comp.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ title: string }>();\n</script>\n`,
    },
    {
      name: "props object from a runtime declaration",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst p = defineProps({ title: String });\n</script>\n`,
    },
    {
      name: "props object from an array declaration",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst props = defineProps(["title", "size"]);\n</script>\n`,
    },
  ],
};

export default cases;
