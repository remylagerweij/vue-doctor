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
    {
      name: "small constant list of excluded keys",
      filename: "src/SavedSearchActions.vue",
      code: `<script setup>\nconst count = computed(() => {\n  const EXCLUDED = ["isActive", "includeInactive", "organizationId", "startDate", "endDate", "radius", "latitude", "longitude"];\n  let n = 0;\n  for (const key in filters) { if (!EXCLUDED.includes(key)) n++; }\n  return n;\n});\n</script>\n`,
    },
    {
      name: "small readonly module constant",
      code: `const SEEN_EVENT_TYPES: readonly string[] = [EVENT_TYPES.VIEW, EVENT_TYPES.FAVORITE];\nexport const seen = (rows) => { for (const row of rows) { if (!SEEN_EVENT_TYPES.includes(row.type)) continue; } };\n`,
    },
    {
      name: "small ref literal that is never reassigned",
      code: `const tabs = ref(["a", "b", "c"]);\nfor (const x of xs) { tabs.value.includes(x); }\n`,
    },
  ],
  invalid: [
    {
      name: "array literal variable larger than a small constant",
      code: `const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];\nfor (const i of xs) { if (items.includes(i)) {} }\n`,
    },
    {
      name: "empty literal grown inside the loop is a quadratic dedupe",
      code: `export const unique = (xs) => { const seen = []; for (const x of xs) { if (!seen.includes(x)) seen.push(x); } return seen; };\n`,
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
      code: `const selected = ref([]);\nexport const load = async () => { selected.value = await fetchSelection(); };\nfor (const x of xs) { selected.value.includes(x); }\n`,
    },
    {
      name: "parameter annotated as an array",
      code: `export function pick(allowed: string[], xs: string[]) { for (const x of xs) { allowed.includes(x); } }\n`,
    },
  ],
};

export default cases;
