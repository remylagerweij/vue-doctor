import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../../src/plugin/rules/nuxt/nuxt-no-window-in-ssr.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const message = /is not available during SSR/;

ruleTester.run("nuxt-no-window-in-ssr", rule, {
  valid: [
    // Previously flagged: inside onMounted and other client-only hooks
    { code: `onMounted(() => { window.addEventListener("resize", f) })`, filename: "app.vue" },
    { code: `onBeforeUnmount(function () { document.removeEventListener("x", f) })`, filename: "app.vue" },
    // Previously flagged: import.meta.client guard
    { code: `if (import.meta.client) { window.scrollTo(0, 0) }`, filename: "app.vue" },
    { code: `const w = import.meta.client ? window.innerWidth : 0`, filename: "app.vue" },
    { code: `import.meta.client && localStorage.setItem("a", "b")`, filename: "app.vue" },
    // Negated server guard, early return and typeof / process.client guards
    { code: `if (import.meta.server) { init() } else { window.focus() }`, filename: "app.vue" },
    { code: `function f() { if (!import.meta.client) return; navigator.vibrate(1) }`, filename: "app.vue" },
    { code: `if (typeof window !== "undefined") { window.foo() }`, filename: "app.vue" },
    { code: `if (process.client) { document.title = "x" }`, filename: "app.vue" },
    // Client-only files never run on the server
    { code: `window.foo()`, filename: "plugins/analytics.client.ts" },
  ],
  invalid: [
    { code: `window.location.href`, filename: "app.vue", errors: [{ message }] },
    { code: `const token = localStorage.getItem("t")`, filename: "composables/useAuth.ts", errors: [{ message }] },
    // A guard only covers its own branch
    {
      code: `if (import.meta.client) { a() } else { document.title = "x" }`,
      filename: "app.vue",
      errors: [{ message }],
    },
    // The callback of a non-lifecycle function is not client only
    { code: `useAsyncData("k", () => navigator.userAgent)`, filename: "app.vue", errors: [{ message }] },
    // Unrelated condition
    { code: `if (ready) { window.foo() }`, filename: "app.vue", errors: [{ message }] },
  ],
});
