import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../src/plugin/rules/correctness/require-emits-declaration.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const message = /\$emit\(\)/;

ruleTester.run("require-emits-declaration", rule, {
  valid: [
    // Previously flagged: defineEmits present
    { code: `const emit = defineEmits(["change"]); vm.$emit("change")` },
    { code: `defineEmits(["change"]); function f() { this.$emit("change") }` },
    // Previously flagged: emits option (array and object form)
    { code: `export default { emits: ["change"], methods: { go() { this.$emit("change") } } }` },
    { code: `export default { emits: { change: null }, methods: { go() { this.$emit("change", 1) } } }` },
    // defineModel declares update:* events
    { code: `const model = defineModel(); vm.$emit("update:modelValue", 1)` },
    // Dynamic emits option cannot be checked
    { code: `export default { emits: EVENTS, methods: { go() { this.$emit("x") } } }` },
    // No $emit at all
    { code: `const emit = defineEmits(["a"]); emit("a")` },
  ],
  invalid: [
    {
      code: `export default { methods: { go() { this.$emit("change") } } }`,
      errors: [{ message: /without defineEmits\(\)/ }],
    },
    { code: `vm.$emit("a"); vm.$emit("b")`, errors: [{ message }, { message }] },
    {
      code: `export default { emits: ["a"], methods: { go() { this.$emit("b") } } }`,
      errors: [{ message: /\$emit\('b'\) is not listed in the emits option/ }],
    },
    {
      code: `export default { emits: { a: null }, methods: { go() { this.$emit("a"); this.$emit("c") } } }`,
      errors: [{ message: /\$emit\('c'\)/ }],
    },
  ],
});
