import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../src/plugin/rules/performance/js-set-map-lookups.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const message = /in a loop is O\(n\) per call/;

ruleTester.run("js-set-map-lookups", rule, {
  valid: [
    // Previously flagged: string.includes / indexOf
    { code: `const name = "abc"; for (const x of xs) { if (name.includes(x)) {} }` },
    { code: `for (const line of lines) { if (line.includes("#")) {} }` },
    { code: `for (const f of files) { f.path.indexOf("/") }` },
    // Receiver of unknown type
    { code: `function f(value) { for (const x of xs) { value.includes(x) } }` },
    // Not inside a loop
    { code: `const list = [1, 2]; list.includes(1)` },
    // Redeclared as a string elsewhere
    { code: `const v = [1]; function g() { const v = "str"; for (const x of xs) { v.includes(x) } }` },
    // A ref is only an array through .value
    { code: `const r = ref([]); for (const x of xs) { r.includes(x) }` },
  ],
  invalid: [
    { code: `const items = [1, 2, 3]; for (const i of xs) { if (items.includes(i)) {} }`, errors: [{ message }] },
    { code: `for (const i of xs) { [1, 2, 3].indexOf(i) }`, errors: [{ message }] },
    { code: `const ids = rows.map((r) => r.id); while (go()) { ids.includes(next()) }`, errors: [{ message }] },
    {
      code: `const selected = ref([]); for (const x of xs) { selected.value.includes(x) }`,
      errors: [{ message }],
    },
  ],
});
