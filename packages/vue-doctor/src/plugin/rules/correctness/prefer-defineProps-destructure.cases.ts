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
      name: "unrelated function with a similar result name",
      code: `export const props = defineThings();\n`,
    },
    {
      name: "props object passed to toRef (TcoAnalysis.vue)",
      filename: "src/TcoAnalysis.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ make: string; model: string }>();\nconst make = toRef(props, "make");\nconst label = computed(() => props.model);\n</script>\n`,
    },
    {
      name: "withDefaults props object passed to toRefs (Checkbox.vue)",
      filename: "src/Checkbox.vue",
      code: `<script setup lang="ts">\nconst props = withDefaults(defineProps<{ checked?: boolean }>(), { checked: false });\nconst { checked } = toRefs(props);\n</script>\n`,
    },
    {
      name: "props object watched as a whole",
      filename: "src/Chart.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ data: number[] }>();\nwatch(props, () => draw(props.data));\n</script>\n`,
    },
    {
      name: "props object spread and enumerated",
      filename: "src/Wrapper.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ a: string; b: string }>();\nconst forwarded = computed(() => ({ ...props }));\nconst keys = Object.keys(props);\n</script>\n`,
    },
    {
      name: "props object passed to a composable",
      filename: "src/Form.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ modelValue: string }>();\nconst { value } = useField(props);\n</script>\n`,
    },
    {
      name: "dynamic key lookup",
      filename: "src/Cell.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ row: Record<string, string>; column: string }>();\nconst read = (key: string) => props[key];\n</script>\n`,
    },
    {
      name: "props object forwarded with v-bind in the template",
      filename: "src/Forward.vue",
      code: `<template>\n  <Inner v-bind="props" />\n</template>\n<script setup lang="ts">\nconst props = defineProps<{ title: string }>();\nconst upper = computed(() => props.title.toUpperCase());\n</script>\n`,
    },
  ],
  invalid: [
    {
      name: "props object from a type-only declaration",
      filename: "src/Comp.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ title: string }>();\nconst upper = computed(() => props.title.toUpperCase());\n</script>\n`,
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
    {
      name: "withDefaults wrapper only read through members",
      filename: "src/Badge.vue",
      code: `<script setup lang="ts">\nconst props = withDefaults(defineProps<{ size?: string }>(), { size: "md" });\nconst classes = computed(() => ["badge", \`badge-\${props.size}\`]);\n</script>\n`,
    },
    {
      name: "template reads members only",
      filename: "src/Title.vue",
      code: `<template>\n  <h1 :class="props.size">{{ props.title }}</h1>\n</template>\n<script setup lang="ts">\nconst props = defineProps<{ title: string; size: string }>();\nwatch(() => props.title, (title) => track(title));\n</script>\n`,
    },
  ],
};

export default cases;
