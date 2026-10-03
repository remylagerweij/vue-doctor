import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "two mutations stay below the threshold",
      code: `watch(id, () => {\n  loading.value = true;\n  error.value = null;\n});\n`,
    },
    {
      name: "many mutations outside a watcher",
      code: `export function reset() {\n  a.value = 0;\n  b.value = 0;\n  c.value = 0;\n  d.value = 0;\n}\n`,
    },
    {
      name: "watcher whose statements are not mutations",
      code: `watch(id, () => {\n  track(id.value);\n  log("changed");\n  notify();\n});\n`,
    },
    {
      name: "callback passed by reference",
      code: `watch(id, handleChange);\n`,
    },
    {
      name: "single mutation that sets a composed object",
      code: `watchEffect(() => {\n  state.value = { a: a.value, b: b.value, c: c.value };\n});\n`,
    },
  ],
  invalid: [
    {
      name: "three .value assignments in watch",
      code: `watch(id, () => {\n  a.value = 1;\n  b.value = 2;\n  c.value = 3;\n});\n`,
    },
    {
      name: "three assignments in watchEffect",
      code: `watchEffect(() => {\n  a.value = x.value;\n  b.value = y.value;\n  c.value = z.value;\n});\n`,
    },
    {
      name: "mix of setters and assignments",
      code: `watch(user, () => {\n  setName("a");\n  setAge(1);\n  active.value = true;\n});\n`,
    },
  ],
};

export default cases;
