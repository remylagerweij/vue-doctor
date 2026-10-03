import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "computed already used",
      code: `export const doubled = computed(() => count.value * 2);\n`,
    },
    {
      name: "watcher with a real side effect",
      code: `watch(count, () => { save(count.value); });\n`,
    },
    {
      name: "watcher with several statements",
      code: `watch(count, () => {\n  doubled.value = count.value * 2;\n  track(count.value);\n});\n`,
    },
    {
      name: "assignment to a plain property instead of a ref",
      code: `watch(count, () => { state.total = count.value; });\n`,
    },
    {
      name: "watcher callback passed by reference",
      code: `watch(count, handleCount);\n`,
    },
  ],
  invalid: [
    {
      name: "watch that only assigns a derived ref",
      code: `watch(count, () => {\n  doubled.value = count.value * 2;\n});\n`,
    },
    {
      name: "watch over several sources",
      code: `watch([first, last], () => {\n  full.value = first.value + " " + last.value;\n});\n`,
    },
    {
      name: "function expression callback with parameters",
      code: `watch(price, function (next) {\n  label.value = "$" + next;\n});\n`,
    },
  ],
};

export default cases;
