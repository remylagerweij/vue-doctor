import { defineRule } from "../../define-rule.js";
import { createSecretVisitors } from "../../secrets/visitors.js";
import type { RuleContext } from "../../types.js";

// Detects credentials of known providers (OpenAI, Anthropic, Google, GitHub, Slack, Stripe live,
// Supabase service_role, AWS, PEM private keys, ...) in any string in client code: variable
// initializers, object properties, assignments, default parameters and template literals. The
// pattern pack lives in plugin/secrets/providers.ts. Name-based guesses are `no-secret-named-literal`.
export default defineRule({
  meta: {
    id: "no-hardcoded-secret",
    category: "Security",
    defaultSeverity: "error",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-798"],
    owasp: "A07:2021",
    fixable: false,
    critical: true,
    since: "2.0.0",
    help: "Revoke the key and load it from a server-side environment variable (`process.env.X` in `server/`). Only public keys (`VITE_*` / `NUXT_PUBLIC_*`) belong in client code",
    agentGuidance:
      "Remove the hardcoded credential from the source and treat it as leaked: it must be revoked and rotated, since it is already in git history and in the shipped bundle. Read the new key on the server from `process.env` (or Nuxt `runtimeConfig` outside `public`) and call the provider from a server route; never write the credential value into code, comments, commits or your reply.",
  },
  create: (context: RuleContext) => createSecretVisitors(context, "provider"),
});
