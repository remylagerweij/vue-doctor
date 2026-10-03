import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "computed already used",
      code: `export const full = computed(() => first.value + " " + last.value);\n`,
    },
    {
      name: "watchEffect with a real side effect",
      code: `watchEffect(() => { console.log(count.value); });\n`,
    },
    {
      name: "watchEffect synchronising a non-ref target",
      code: `watchEffect(() => { document.title = title.value; });\n`,
    },
    {
      name: "watchEffect with several statements",
      code: `watchEffect(() => {\n  full.value = first.value + last.value;\n  track(full.value);\n});\n`,
    },
    {
      name: "plain watch is covered by a different rule",
      code: `watch(count, () => { doubled.value = count.value * 2; });\n`,
    },
  ],
  invalid: [
    {
      name: "watchEffect that only assigns a ref",
      code: `watchEffect(() => {\n  full.value = first.value + " " + last.value;\n});\n`,
    },
    {
      name: "function expression callback",
      code: `watchEffect(function () {\n  total.value = items.value.length;\n});\n`,
    },
    {
      name: "inside script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nwatchEffect(() => {\n  label.value = props.name.toUpperCase();\n});\n</script>\n`,
    },
  ],
};

export default cases;
