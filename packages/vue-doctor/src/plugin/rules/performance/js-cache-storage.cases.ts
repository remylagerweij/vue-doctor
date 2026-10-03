import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "value read once and cached",
      code: `const theme = localStorage.getItem("theme");\nexport const dark = theme === "dark";\nexport const light = theme === "light";\n`,
    },
    {
      name: "different keys",
      code: `export const a = localStorage.getItem("a");\nexport const b = localStorage.getItem("b");\n`,
    },
    {
      name: "same key in two different storages is not a duplicate",
      code: `export const a = localStorage.getItem("token");\nexport const b = sessionStorage.getItem("other");\n`,
    },
    {
      name: "getItem on an object that is not web storage",
      code: `export const a = cache.getItem("k");\nexport const b = cache.getItem("k");\n`,
    },
    {
      name: "dynamic keys cannot be compared",
      code: `export const a = (key) => localStorage.getItem(key) ?? localStorage.getItem(key);\n`,
    },
  ],
  invalid: [
    {
      name: "same localStorage key read twice",
      code: `export const a = localStorage.getItem("theme") === "dark";\nexport const b = localStorage.getItem("theme") === "light";\n`,
    },
    {
      name: "same sessionStorage key read twice",
      code: `export const a = sessionStorage.getItem("cart");\nexport const b = sessionStorage.getItem("cart");\n`,
    },
    {
      name: "only the second read is reported when read three times",
      code: `localStorage.getItem("a");\nlocalStorage.getItem("a");\nlocalStorage.getItem("a");\n`,
    },
  ],
};

export default cases;
