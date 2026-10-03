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
      name: "splice on props",
      code: `export const rest = computed(() => props.items.splice(1));\n`,
    },
  ],
};

export default cases;
