import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import noLeakyErrorRethrow from "../../src/plugin/rules/server/no-leaky-error-rethrow.js";
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
      errors: [{ message: /console\.log\(\) left in a request handler/ }],
    },
    {
      code: `console.debug("x")`,
      filename: "app\\server\\middleware\\auth.js",
      errors: [{ message: /console\.debug\(\) left in a request handler/ }],
    },
  ],
});

ruleTester.run("no-leaky-error-rethrow (path-based)", noLeakyErrorRethrow, {
  valid: [
    {
      code: `export const f = async () => { try { return 1 } catch (e) { throw createError({ statusMessage: e.message }) } }`,
      filename: "src\\pages\\index.js",
    },
  ],
  invalid: [
    {
      code: `export const f = async () => { try { return 1 } catch (e) { throw createError({ statusMessage: e.message }) } }`,
      filename: "server\\utils\\bad.js",
      errors: [{ message: /sends the error's own message to the client/ }],
    },
  ],
});
