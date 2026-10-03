import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../src/plugin/rules/correctness/no-this-in-setup.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const message = /"this" is not available/;

ruleTester.run("no-this-in-setup", rule, {
  valid: [
    // Previously flagged: Options API methods
    { code: `export default { methods: { go() { this.count++ } } }`, filename: "Comp.vue" },
    // Previously flagged: computed / lifecycle hooks
    {
      code: `export default { computed: { double() { return this.count * 2 } }, mounted() { this.init() } }`,
      filename: "Comp.vue",
    },
    // Previously flagged: a regular function inside setup() binds its own this
    { code: `export default { setup() { function Legacy() { this.x = 1 } return {} } }`, filename: "Comp.vue" },
    // Previously flagged: class bodies
    { code: `class Counter { inc() { this.n++ } }`, filename: "Comp.vue" },
    // Not a .vue file and not setup()
    { code: `const x = this`, filename: "util.ts" },
  ],
  invalid: [
    { code: `this.foo = 1`, filename: "Comp.vue", errors: [{ message }] },
    { code: `export default { setup() { this.foo = 1 } }`, filename: "Comp.vue", errors: [{ message }] },
    // Arrow functions inherit this from setup()
    {
      code: `export default { setup() { onMounted(() => { this.init() }) } }`,
      filename: "Comp.vue",
      errors: [{ message }],
    },
    { code: `export default { setup: function () { return this.props } }`, filename: "api.ts", errors: [{ message }] },
  ],
});
