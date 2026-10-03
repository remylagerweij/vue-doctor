import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../src/plugin/rules/reactivity/no-missing-await-nextTick.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const message = /Missing await on nextTick\(\)/;

ruleTester.run("no-missing-await-nextTick", rule, {
  valid: [
    // Previously flagged: awaited
    { code: `async function f() { await nextTick(); read() }` },
    { code: `async function f() { await Vue.nextTick() }` },
    // Previously flagged: returned
    { code: `function f() { return nextTick() }` },
    { code: `const f = () => nextTick()` },
    // Previously flagged: promise chain
    { code: `nextTick().then(() => read())` },
    // Previously flagged: callback style, stored, passed on, voided
    { code: `nextTick(() => read())` },
    { code: `const pending = nextTick()` },
    { code: `Promise.all([nextTick(), other()])` },
    { code: `void nextTick()` },
  ],
  invalid: [
    { code: `nextTick();`, errors: [{ message }] },
    { code: `function f() { nextTick(); read() }`, errors: [{ message }] },
    { code: `Vue.nextTick();`, errors: [{ message }] },
    { code: `async function f() { count.value++; nextTick(); read() }`, errors: [{ message }] },
  ],
});
