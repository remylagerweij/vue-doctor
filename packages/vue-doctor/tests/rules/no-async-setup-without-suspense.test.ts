import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../src/plugin/rules/correctness/no-async-setup-without-suspense.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const message = /Async components require a <Suspense> boundary/;

ruleTester.run("no-async-setup-without-suspense", rule, {
  valid: [
    // Previously flagged: await inside a lifecycle callback
    { code: `onMounted(async () => { await load() })`, filename: "Comp.vue" },
    // Previously flagged: await inside an event handler / helper in script setup
    { code: `async function submit() { await save() }`, filename: "Comp.vue" },
    // Previously flagged: await inside a method of an Options API component
    { code: `export default { methods: { async load() { await fetch("/a") } } }`, filename: "Comp.vue" },
    // Previously flagged: await in a function nested inside setup()
    {
      code: `export default { setup() { const run = async () => { await go() }; return { run } } }`,
      filename: "Comp.vue",
    },
    // Not a .vue file
    { code: `await load()`, filename: "util.ts" },
  ],
  invalid: [
    { code: `const data = await fetch("/api")`, filename: "Comp.vue", errors: [{ message }] },
    { code: `export default { async setup() { await load() } }`, filename: "Comp.vue", errors: [{ message }] },
    { code: `export default { setup: async () => { await load() } }`, filename: "Comp.vue", errors: [{ message }] },
    {
      code: `export default { setup: async function () { const a = await one(); const b = await two() } }`,
      filename: "src\\Comp.vue",
      errors: [{ message }, { message }],
    },
  ],
});
