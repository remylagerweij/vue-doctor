import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "async guard that returns instead of using next",
      code: `router.beforeEach(async (to) => {\n  await loadUser();\n  if (!user.value) return "/login";\n});\n`,
    },
    {
      name: "async guard that calls next",
      code: `router.beforeEach(async (to, from, next) => {\n  await loadUser();\n  next();\n});\n`,
    },
    {
      name: "next handed to a helper that may call it",
      code: `router.beforeEach(async (to, from, next) => {\n  await runGuards(to, next);\n});\n`,
    },
    {
      name: "synchronous guard",
      code: `router.beforeEach((to, from, next) => {\n  next();\n});\n`,
    },
    {
      name: "beforeEach on an unrelated object",
      code: `app.beforeEach(async (to, from, next) => {\n  await work();\n});\n`,
    },
  ],
  invalid: [
    {
      name: "async arrow guard declares next but never calls it",
      code: `router.beforeEach(async (to, from, next) => {\n  await loadUser();\n});\n`,
    },
    {
      name: "beforeResolve with a function expression",
      code: `router.beforeResolve(async function (to, from, next) {\n  await prefetch(to);\n});\n`,
    },
    {
      name: "this.$router guard",
      code: `export default { created() { this.$router.beforeEach(async (to, from, next) => { await sync(); }); } };\n`,
    },
  ],
};

export default cases;
