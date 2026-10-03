import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "NuxtLink component",
      code: `export const link = () => h(NuxtLink, { to: "/about" }, () => "About");\n`,
    },
    {
      name: "resolved NuxtLink component",
      code: `export const link = () => h(resolveComponent("NuxtLink"), { to: "/" });\n`,
    },
    {
      name: "other element with a name that starts with a",
      code: `export const el = () => h("abbr", { title: "HyperText" }, "HTML");\n`,
    },
    {
      name: "unrelated helper named like h",
      code: `export const el = hash("a");\n`,
    },
  ],
  invalid: [
    {
      name: "anchor with href",
      code: `export const link = () => h("a", { href: "/about" }, "About");\n`,
    },
    {
      name: "anchor without props",
      code: `export const link = () => h("a");\n`,
    },
    {
      name: "anchor in a render function of a component",
      code: `export default { render() { return h("nav", [h("a", { href: "/" }, "Home")]); } };\n`,
    },
  ],
};

export default cases;
