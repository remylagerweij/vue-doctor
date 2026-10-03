import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "initial declaration",
      code: `export const state = reactive({ a: 1 });\n`,
    },
    {
      name: "merging new values with Object.assign",
      code: `const state = reactive({ a: 1 });\nexport const reset = () => Object.assign(state, { a: 0 });\n`,
    },
    {
      name: "assigning to a property rather than the binding",
      code: `export const swap = (holder) => { holder.state = reactive({ a: 1 }); };\n`,
    },
    {
      name: "reassigning a variable to something that is not reactive()",
      code: `let list = [];\nexport const clear = () => { list = []; };\n`,
    },
    {
      name: "replacing a ref's value",
      code: `const form = ref({ a: 1 });\nexport const reset = () => { form.value = { a: 0 }; };\n`,
    },
  ],
  invalid: [
    {
      name: "reassigning a reactive variable",
      code: `let state = reactive({ a: 1 });\nexport const reset = () => { state = reactive({ a: 0 }); };\n`,
    },
    {
      name: "reassignment inside a watcher",
      code: `let form = reactive({});\nwatch(id, () => { form = reactive(defaults()); });\n`,
    },
    {
      name: "reassignment in script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nlet filters = reactive({ q: "" });\nfunction clear() { filters = reactive({ q: "" }); }\n</script>\n`,
    },
  ],
};

export default cases;
