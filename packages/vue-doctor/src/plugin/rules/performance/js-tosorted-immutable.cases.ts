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
    {
      name: "spreading Map values has no toSorted",
      code: `const stats = new Map();\nexport const top = () => [...stats.values()].sort((a, b) => b.score - a.score);\n`,
    },
    {
      name: "spreading Map entries of a parameter",
      code: `export const groups = (byProvince) => [...byProvince.entries()].sort(([a], [b]) => a.localeCompare(b));\n`,
    },
    {
      name: "spreading a new Set to dedupe",
      code: `export const unique = (ids) => [...new Set(ids)].sort();\n`,
    },
    {
      name: "spreading a ref that holds a Set",
      filename: "src/RoleDetail.vue",
      code: `<script setup lang="ts">\nconst selectedKeys = ref<Set<string>>(new Set(props.role.permissionKeys));\nconst current = computed(() => [...selectedKeys.value].sort());\n</script>\n`,
    },
    {
      name: "spreading a parameter or variable annotated as a Set",
      code: `export const run = (tags: Set<string>) => { const seen: ReadonlySet<string> = tags; return [[...tags].sort(), [...seen].sort()]; };\n`,
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
    {
      name: "spread of an array prop",
      filename: "src/TcoMaintenanceSchedule.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ intervals: Interval[] }>();\nconst ordered = computed(() => [...props.intervals].sort((a, b) => a.km - b.km));\n</script>\n`,
    },
    {
      name: "only the array spread is reported next to a Set spread",
      code: `const ids = new Set();\nexport const a = [...ids].sort();\nexport const b = [...rows].sort();\n`,
    },
  ],
};

export default cases;
