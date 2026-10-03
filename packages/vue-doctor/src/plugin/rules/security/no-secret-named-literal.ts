import { defineRule } from "../../define-rule.js";
import { createSecretVisitors } from "../../secrets/visitors.js";
import type { RuleContext } from "../../types.js";

// Heuristic companion of `no-hardcoded-secret`: a secret-named identifier (`apiKey`, `API_SECRET`,
// `x-api-key`, `clientSecret`, `password`) assigned a long, random-looking literal in client code.
// Also reports provider-format credentials in server, config and test files: they are not shipped
// to browsers, but a committed credential is still leaked to everyone with repository access.
export default defineRule({
  meta: {
    id: "no-secret-named-literal",
    category: "Security",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-798"],
    owasp: "A07:2021",
    fixable: false,
    critical: true,
    since: "2.0.0",
    help: "Load the value from an environment variable instead of committing it. Only `VITE_*` / `NUXT_PUBLIC_*` values are meant for the client",
    agentGuidance:
      "Check whether the literal is a real credential. If it is, remove it from the source, revoke and rotate it, and read it from `process.env` on the server (or `runtimeConfig` outside `public` in Nuxt). If it is a public identifier or a test value, rename the variable so it is not secret-like, or suppress the finding with a reason. Never write the credential value into code, comments, commits or your reply.",
  },
  create: (context: RuleContext) => createSecretVisitors(context, "heuristic"),
});
