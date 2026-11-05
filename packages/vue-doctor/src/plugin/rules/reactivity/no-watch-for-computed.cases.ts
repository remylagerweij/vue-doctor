import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "computed already used",
      code: `export const doubled = computed(() => count.value * 2);\n`,
    },
    {
      name: "watcher with a real side effect",
      code: `watch(count, () => { save(count.value); });\n`,
    },
    {
      name: "watcher with several statements",
      code: `watch(count, () => {\n  doubled.value = count.value * 2;\n  track(count.value);\n});\n`,
    },
    {
      name: "assignment to a plain property instead of a ref",
      code: `watch(count, () => { state.total = count.value; });\n`,
    },
    {
      name: "watcher callback passed by reference",
      code: `watch(count, handleCount);\n`,
    },
    {
      name: "page reset does not read the source (SeoWorklist.vue, ApiKeyTable.vue)",
      code: `const page = ref(1);\nwatch([searchQuery, selectedMode], () => {\n  page.value = 1;\n});\nexport const next = () => { page.value++; };\n`,
    },
    {
      name: "menu closed on navigation (layouts/default.vue)",
      code: `const menuOpen = ref(false);\nwatch(() => route.fullPath, () => {\n  menuOpen.value = false;\n});\n`,
    },
    {
      name: "editable mirror of a prop bound with v-model (KentekenSearchForm.vue)",
      filename: "src/KentekenSearchForm.vue",
      code: `<template>\n  <input v-model="plate" />\n</template>\n<script setup lang="ts">\nconst props = defineProps<{ modelValue: string }>();\nconst plate = ref(props.modelValue);\nwatch(() => props.modelValue, (value) => {\n  plate.value = value;\n});\n</script>\n`,
    },
    {
      name: "mirror that the template assigns in a handler",
      filename: "src/Dropdown.vue",
      code: `<template>\n  <button @click="selected = null">clear</button>\n</template>\n<script setup lang="ts">\nconst props = defineProps<{ value: string | null }>();\nconst selected = ref(props.value);\nwatch(() => props.value, (value) => {\n  selected.value = value;\n});\n</script>\n`,
    },
    {
      name: "local copy also replaced after a request (TasteProfilePanel.vue)",
      code: `const profile = ref(null);\nwatch(data, (value) => {\n  profile.value = value ?? null;\n}, { immediate: true });\nexport const save = async () => {\n  profile.value = await post(profile.value);\n};\n`,
    },
    {
      name: "ref handed to a composable that may write it",
      code: `const query = ref("");\nwatch(() => route.query.q, (q) => {\n  query.value = String(q ?? "");\n});\nuseDebouncedSearch(query);\n`,
    },
    {
      name: "ref returned from a composable",
      code: `export const useMirror = (source) => {\n  const copy = ref(source.value);\n  watch(source, (value) => {\n    copy.value = value;\n  });\n  return { copy };\n};\n`,
    },
  ],
  invalid: [
    {
      name: "watch that only assigns a derived ref",
      code: `const doubled = ref(0);\nwatch(count, () => {\n  doubled.value = count.value * 2;\n});\n`,
    },
    {
      name: "watch over several sources",
      code: `watch([first, last], () => {\n  full.value = first.value + " " + last.value;\n});\n`,
    },
    {
      name: "function expression callback with parameters",
      code: `watch(price, function (next) {\n  label.value = "$" + next;\n});\n`,
    },
    {
      name: "getter source read through the callback argument in an SFC",
      filename: "src/Status.vue",
      code: `<template>\n  <span>{{ status }}</span>\n</template>\n<script setup lang="ts">\nconst props = defineProps<{ isEnrolled: boolean }>();\nconst status = ref("");\nwatch(() => props.isEnrolled, (enrolled) => {\n  status.value = enrolled ? "on" : "off";\n}, { immediate: true });\n</script>\n`,
    },
  ],
};

export default cases;
