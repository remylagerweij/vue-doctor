import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import * as vueParser from "vue-eslint-parser";
import noEval from "../../src/plugin/rules/security/no-eval.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parser: vueParser, ecmaVersion: 2020, sourceType: "module" },
});

const message = "eval() is a security risk — use safer alternatives";

ruleTester.run("no-eval", noEval, {
  valid: [
    { code: `<script setup>const data = JSON.parse(text)</script>` },
    // Methods and properties that merely share the name are not the global eval.
    { code: `<script setup>sandbox.eval(code); const evaluate = () => {}; evaluate()</script>` },
    { code: `<script setup>window['eval']; const fn = window.evaluate</script>` },
  ],
  invalid: [
    { code: `<script setup>eval("1 + 1")</script>`, errors: [{ message }] },
    { code: `<script setup>window.eval(code)</script>`, errors: [{ message }] },
    { code: `<script setup>globalThis.eval(code)</script>`, errors: [{ message }] },
  ],
});
