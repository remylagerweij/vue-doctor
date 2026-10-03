import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import nuxtRequireServerRouteErrorHandling from "../../src/plugin/rules/nuxt/nuxt-require-server-route-error-handling.js";
import serverNoConsoleInHandler from "../../src/plugin/rules/server/server-no-console-in-handler.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

// Filenames use backslashes on purpose: oxlint reports native paths on Windows, and the rules
// must match them through the shared getFilename() normalisation.
ruleTester.run("server-no-console-in-handler (path-based)", serverNoConsoleInHandler, {
  valid: [
    { code: `console.log("x")`, filename: "src\\utils\\logger.js" },
    { code: `consola.info("x")`, filename: "server/api/users.js" },
  ],
  invalid: [
    {
      code: `console.log("x")`,
      filename: "server/api/users.js",
      errors: [{ message: /console\.log\(\) in server handler/ }],
    },
    {
      code: `console.warn("x")`,
      filename: "app\\server\\middleware\\auth.js",
      errors: [{ message: /console\.warn\(\) in server handler/ }],
    },
  ],
});

ruleTester.run("nuxt-require-server-route-error-handling (path-based)", nuxtRequireServerRouteErrorHandling, {
  valid: [
    {
      code: `export default defineEventHandler(async (event) => { try { return 1 } catch (e) { throw e } })`,
      filename: "server/api/ok.js",
    },
    {
      code: `export default defineEventHandler(async (event) => { return 1 })`,
      filename: "src\\pages\\index.js",
    },
  ],
  invalid: [
    {
      code: `export default defineEventHandler(async (event) => { return 1 })`,
      filename: "server\\api\\bad.js",
      errors: [{ message: /Server route handler without try\/catch/ }],
    },
  ],
});
