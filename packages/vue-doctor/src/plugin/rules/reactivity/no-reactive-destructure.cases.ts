import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "toRefs keeps reactivity",
      code: `const state = reactive({ a: 1, b: 2 });\nexport const { a, b } = toRefs(state);\n`,
    },
    {
      name: "keeping the reactive object whole",
      code: `export const state = reactive({ a: 1 });\n`,
    },
    {
      name: "destructuring a plain object",
      code: `const { a, b } = state;\nexport { a, b };\n`,
    },
    {
      name: "composable returning refs",
      code: `export const { x, y } = useMouse();\n`,
    },
  ],
  invalid: [
    {
      name: "object destructuring of a fresh reactive",
      code: `export const { a, b } = reactive({ a: 1, b: 2 });\n`,
    },
    {
      name: "array destructuring of a reactive array",
      code: `export const [first] = reactive([1, 2]);\n`,
    },
    {
      name: "destructuring a reactive built from existing state",
      code: `const { count } = reactive(initialState);\nexport { count };\n`,
    },
  ],
};

export default cases;
