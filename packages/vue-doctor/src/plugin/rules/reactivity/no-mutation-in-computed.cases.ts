import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "pure derived value",
      code: `export const total = computed(() => items.value.reduce((sum, item) => sum + item.price, 0));\n`,
    },
    {
      name: "building a local array is not a side effect",
      code: `export const names = computed(() => {\n  const out = [];\n  for (const user of users.value) out.push(user.name);\n  return out;\n});\n`,
    },
    {
      name: "sorting a copy of the source array",
      code: `export const sorted = computed(() => [...items.value].sort((a, b) => a.price - b.price));\n`,
    },
    {
      name: "sorting the result of slice",
      code: `export const newest = computed(() => items.value.slice().sort(byDate).reverse());\n`,
    },
    {
      name: "sorting Object.entries (UserPreferences.vue)",
      code: `export const top = computed(() => Object.entries(scores.value).sort(([, a], [, b]) => b - a).slice(0, 5));\n`,
    },
    {
      name: "push onto a cast flatMap result (ChartTimelineControls.vue)",
      filename: "src/Chart.vue",
      code: `<script setup lang="ts">\nconst all = computed(() => {\n  const points = data.value.flatMap((p) => [p.min, p.max]) as number[];\n  if (props.current) points.push(props.current);\n  return points;\n});\n</script>\n`,
    },
    {
      name: "push onto a ternary of fresh arrays (dealers/index.vue)",
      code: `export const scripts = computed(() => {\n  const list = ld.value ? [{ innerHTML: ld.value }] : [];\n  if (faq.value) list.push({ innerHTML: faq.value });\n  return list;\n});\n`,
    },
    {
      name: "sorting a filter-or-slice ternary (merken/index.vue)",
      code: `export const filtered = computed(() => {\n  const q = search.value;\n  const list = q ? brands.value.filter((b) => b.name.includes(q)) : brands.value.slice();\n  return list.sort((a, b) => a.name.localeCompare(b.name));\n});\n`,
    },
    {
      name: "pop on a split result (motoren/[slug].vue)",
      code: `export const id = computed(() => slug.value.split("-").pop());\n`,
    },
    {
      name: "push into an array read from a getter-local Map (motorzaken/index.vue)",
      code: `export const groups = computed(() => {\n  const byProvince = new Map();\n  for (const city of cities.value) {\n    const group = byProvince.get(city.province);\n    if (group) group.push(city);\n    else byProvince.set(city.province, [city]);\n  }\n  return [...byProvince.entries()].sort();\n});\n`,
    },
    {
      name: "fresh values from Array.from, structuredClone and a fallback literal",
      code: `export const a = computed(() => Array.from(set.value).sort());\nexport const b = computed(() => structuredClone(list.value).reverse());\nexport const c = computed(() => (cache.value?.slice() || []).sort());\n`,
    },
    {
      name: "mutation outside computed in a watcher",
      code: `watch(id, () => { list.value.push(id.value); });\n`,
    },
  ],
  invalid: [
    {
      name: "assigning a ref inside computed",
      code: `export const doubled = computed(() => {\n  calls.value = calls.value + 1;\n  return count.value * 2;\n});\n`,
    },
    {
      name: "incrementing a ref inside computed",
      code: `export const double = computed(() => {\n  val.value++;\n  return val.value * 2;\n});\n`,
    },
    {
      name: "push onto reactive state",
      code: `export const visible = computed(() => {\n  history.push(filter.value);\n  return items.value;\n});\n`,
    },
    {
      name: "in-place sort of the source array",
      code: `export const sorted = computed(() => items.value.sort((a, b) => a - b));\n`,
    },
    {
      name: "sorting a ternary whose fallback is the source array",
      code: `export const list = computed(() => (q.value ? items.value.filter(match) : items.value).sort(byName));\n`,
    },
    {
      name: "push into a Map value that came from reactive state",
      code: `export const groups = computed(() => {\n  store.byKey.get(key.value).push(item.value);\n  return store.byKey;\n});\n`,
    },
    {
      name: "splice on props",
      code: `export const rest = computed(() => props.items.splice(1));\n`,
    },
  ],
};

export default cases;
