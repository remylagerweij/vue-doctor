import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "string includes inside a loop",
      code: `const name = "abc";\nfor (const x of xs) { if (name.includes(x)) {} }\n`,
    },
    {
      name: "string indexOf on a property of the loop variable",
      code: `for (const f of files) { f.path.indexOf("/"); }\n`,
    },
    {
      name: "receiver of unknown type",
      code: `export function f(value) { for (const x of xs) { value.includes(x); } }\n`,
    },
    {
      name: "array lookup outside of a loop",
      code: `const list = [1, 2];\nexport const has = list.includes(1);\n`,
    },
    {
      name: "name redeclared as a string in another scope",
      code: `const v = [1];\nexport function g() { const v = "str"; for (const x of xs) { v.includes(x); } }\n`,
    },
    {
      name: "a ref is only an array through .value",
      code: `const r = ref([]);\nfor (const x of xs) { r.includes(x); }\n`,
    },
    {
      name: "Set lookups are already O(1)",
      code: `const allowed = new Set([1, 2, 3]);\nfor (const x of xs) { allowed.has(x); }\n`,
    },
  ],
  invalid: [
    {
      name: "array literal variable in a for-of loop",
      code: `const items = [1, 2, 3];\nfor (const i of xs) { if (items.includes(i)) {} }\n`,
    },
    {
      name: "indexOf on an inline array literal",
      code: `for (const i of xs) { [1, 2, 3].indexOf(i); }\n`,
    },
    {
      name: "array produced by map in a while loop",
      code: `const ids = rows.map((r) => r.id);\nwhile (go()) { ids.includes(next()); }\n`,
    },
    {
      name: "ref holding an array accessed through .value",
      code: `const selected = ref([]);\nfor (const x of xs) { selected.value.includes(x); }\n`,
    },
    {
      name: "parameter annotated as an array",
      code: `export function pick(allowed: string[], xs: string[]) { for (const x of xs) { allowed.includes(x); } }\n`,
    },
  ],
};

export default cases;
