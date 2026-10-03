import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "watching a single getter of the store",
      code: `const authStore = useAuthStore();\nwatch(() => authStore.user, () => {});\n`,
    },
    {
      name: "subscribing to the store",
      code: `const authStore = useAuthStore();\nauthStore.$subscribe(() => console.log("changed"));\n`,
    },
    {
      name: "names that merely end in the letters 'store'",
      code: `watch(restore, () => {});\nwatch(bookstore, () => {});\nwatch(datastore, () => {});\n`,
    },
    {
      name: "watching a plain ref",
      code: `const count = ref(0);\nwatch(count, () => {});\n`,
    },
  ],
  invalid: [
    {
      name: "watching a variable named store",
      code: `const store = useMainStore();\nwatch(store, () => {});\n`,
    },
    {
      name: "watching a variable like authStore",
      code: `const authStore = useAuthStore();\nwatch(authStore, () => {}, { deep: true });\n`,
    },
    {
      name: "getter that returns the whole store",
      code: `const userStore = useUserStore();\nwatch(() => userStore, () => {});\n`,
    },
  ],
};

export default cases;
