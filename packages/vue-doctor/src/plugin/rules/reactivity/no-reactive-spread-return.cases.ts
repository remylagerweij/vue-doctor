import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "toRefs keeps every property linked",
      code: `import { reactive, toRefs } from "vue";\nexport function useCounter() {\n  const state = reactive({ count: 0 });\n  const inc = () => state.count++;\n  return { ...toRefs(state), inc };\n}\n`,
    },
    {
      name: "returning the reactive object itself",
      code: `import { reactive } from "vue";\nexport function useForm() {\n  const form = reactive({ name: "" });\n  return form;\n}\n`,
    },
    {
      name: "spreading into a request payload (an intentional snapshot)",
      code: `import { reactive } from "vue";\nexport function useForm() {\n  const form = reactive({ name: "" });\n  async function submit() {\n    await post({ ...form, sentAt: Date.now() });\n  }\n  const snapshot = () => ({ ...form });\n  return { form, submit, snapshot };\n}\n`,
    },
    {
      name: "spreading a plain object of defaults",
      code: `export function useOptions() {\n  const defaults = { size: "md", round: false };\n  return { ...defaults };\n}\n`,
    },
    {
      name: "spreading reactive state in a function that is not a composable",
      code: `import { reactive } from "vue";\nconst state = reactive({ a: 1 });\nexport function serialize() {\n  return { ...state };\n}\n`,
    },
    {
      name: "a name declared both as reactive and as a plain object",
      code: `import { reactive } from "vue";\nexport function useA() {\n  const state = reactive({ a: 1 });\n  return { state };\n}\nexport function useB() {\n  const state = { b: 2 };\n  return { ...state };\n}\n`,
    },
    {
      name: "reactive imported from another library",
      code: `import { reactive } from "@legendapp/state";\nexport function useStore() {\n  const store = reactive({ a: 1 });\n  return { ...store };\n}\n`,
    },
  ],
  invalid: [
    {
      name: "composable spreads reactive state",
      code: `import { reactive } from "vue";\nexport function useCounter() {\n  const state = reactive({ count: 0 });\n  const inc = () => state.count++;\n  return { ...state, inc };\n}\n`,
    },
    {
      name: "arrow composable with an expression body",
      code: `import { reactive } from "vue";\nconst state = reactive({ open: false });\nexport const useDrawer = () => ({ ...state, toggle: () => (state.open = !state.open) });\n`,
    },
    {
      name: "setup() of a component returns spread state",
      code: `import { defineComponent, reactive } from "vue";\nexport default defineComponent({\n  setup() {\n    const state = reactive({ items: [] as string[] });\n    return { ...state };\n  },\n});\n`,
    },
    {
      name: "Pinia setup store",
      code: `import { defineStore } from "pinia";\nimport { shallowReactive } from "vue";\nexport const useCart = defineStore("cart", () => {\n  const state = shallowReactive({ items: [], total: 0 });\n  return { ...state };\n});\n`,
    },
    {
      name: "setup(props) returns spread props (auto-imported reactive in a .vue file)",
      filename: "src/components/Tag.vue",
      code: `<script>\nexport default {\n  props: { label: String },\n  setup(props) {\n    const extra = reactive({ hover: false });\n    return { ...props, ...extra };\n  },\n};\n</script>\n`,
      count: 2,
    },
  ],
};

export default cases;
