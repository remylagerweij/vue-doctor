import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "shallow watch on a specific property",
      code: `watch(() => props.user.id, () => reload());\n`,
    },
    {
      name: "options without deep",
      code: `watch(query, () => search(), { immediate: true });\n`,
    },
    {
      name: "deep explicitly disabled",
      code: `watch(state, () => save(), { deep: false });\n`,
    },
    {
      name: "numeric depth limit (Vue 3.5) is not a full traversal",
      code: `watch(state, () => save(), { deep: 1 });\n`,
    },
    {
      name: "watchEffect has no deep option",
      code: `watchEffect(() => { document.title = title.value; });\n`,
    },
  ],
  invalid: [
    {
      name: "deep: true on a reactive object",
      code: `watch(form, () => save(), { deep: true });\n`,
    },
    {
      name: "deep together with immediate",
      code: `watch(() => props.config, () => apply(), { immediate: true, deep: true });\n`,
    },
    {
      name: "inside script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nwatch(items, (next) => sync(next), { deep: true });\n</script>\n`,
    },
  ],
};

export default cases;
