import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../src/plugin/rules/correctness/no-array-index-as-key.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const message = /Avoid using array index/;

ruleTester.run("no-array-index-as-key", rule, {
  valid: [
    // Previously flagged: index used for something other than a key
    { code: `items.map((item, index) => item * index)` },
    { code: "const labels = items.map((item, i) => `${i + 1}. ${item}`)" },
    // Previously flagged: index parameter present but unused
    { code: `items.map((item, index) => ({ id: item.id }))` },
    // Stable key
    { code: `items.map((item, index) => h("li", { key: item.id }, index))` },
    // Index name that is not tracked
    { code: `items.map((item, position) => h("li", { key: position }))` },
  ],
  invalid: [
    { code: `items.map((item, index) => h("li", { key: index }, item))`, errors: [{ message }] },
    { code: `items.map(function (item, idx) { return h(Row, { key: idx }) })`, errors: [{ message }] },
    { code: "items.map((item, i) => h(\"li\", { key: `row-${i}` }, item))", errors: [{ message }] },
    {
      code: `items.map((item, index) => <li key={index}>{item}</li>)`,
      languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
      errors: [{ message }],
    },
  ],
});
