import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "toSorted already used",
      code: `export const sorted = items.toSorted((a, b) => a - b);\n`,
    },
    {
      name: "in-place sort of an owned array",
      code: `const scratch = [3, 1, 2];\nscratch.sort();\n`,
    },
    {
      name: "merging two arrays before sorting",
      code: `export const merged = [...a, ...b].sort();\n`,
    },
    {
      name: "sorting an array literal",
      code: `export const letters = ["b", "a"].sort();\n`,
    },
  ],
  invalid: [
    {
      name: "spread copy then sort",
      code: `export const sorted = [...items].sort();\n`,
    },
    {
      name: "spread copy with comparator",
      code: `export const sorted = [...items].sort((a, b) => a.price - b.price);\n`,
    },
    {
      name: "spread of a reactive list in a computed",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst sorted = computed(() => [...list.value].sort(byName));\n</script>\n`,
    },
  ],
};

export default cases;
