import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "watcher delegates to a store action",
      code: `watch(id, () => { store.load(id.value); });\n`,
    },
    {
      name: "reactive useFetch refetches by itself",
      code: `const { data } = useFetch(() => "/api/users/" + id.value);\n`,
    },
    {
      name: "fetch outside of any watcher",
      code: `export const load = () => fetch("/api/users");\n`,
    },
    {
      name: "watcher callback passed by reference",
      code: `watch(id, loadUser);\n`,
    },
    {
      name: "method on an object that is not an HTTP client",
      code: `watch(id, () => { cache.get(id.value); });\n`,
    },
  ],
  invalid: [
    {
      name: "fetch inside watch",
      code: `watch(id, async () => {\n  const response = await fetch("/api/users/" + id.value);\n  user.value = await response.json();\n});\n`,
    },
    {
      name: "axios inside watchEffect",
      code: `watchEffect(() => {\n  axios.get("/api/users/" + id.value);\n});\n`,
    },
    {
      name: "ky call inside watch with a function expression",
      code: `watch(query, function () {\n  ky.get("/search", { searchParams: { q: query.value } });\n});\n`,
    },
  ],
};

export default cases;
