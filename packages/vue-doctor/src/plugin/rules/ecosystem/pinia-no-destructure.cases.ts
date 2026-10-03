import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "storeToRefs keeps state reactive",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst { name } = storeToRefs(useUserStore());\nconst store = useAuthStore();\n</script>\n`,
    },
    {
      name: "destructuring only actions is safe",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst { increment, fetchUser, $reset } = useCounterStore();\n</script>\n`,
    },
    {
      name: "non-store composable returning plain values",
      code: `export const { x, y } = useMouse();\n`,
    },
    {
      name: "function whose name merely ends in store-like text without use prefix",
      code: `const { a, b } = restoreStore();\nexport { a, b };\n`,
    },
    {
      name: "empty destructuring pattern",
      code: `const {} = useCounterStore();\n`,
    },
  ],
  invalid: [
    {
      name: "state fields destructured from a store",
      code: `const { count, user } = useAuthStore();\nexport { count, user };\n`,
    },
    {
      name: "state mixed with an action still loses reactivity",
      code: `const { count, increment } = useCounterStore();\nexport { count, increment };\n`,
    },
    {
      name: "rest element copies the store",
      code: `const { ...rest } = useUserStore();\nexport { rest };\n`,
    },
  ],
};

export default cases;
