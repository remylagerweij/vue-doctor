import type { RuleCases } from "../../rule-cases.js";
import { FAKE_PROVIDER_SECRETS, fakeBody, fakeJwt } from "../../secrets/fake-secrets.js";

// Values are generated at run time so the repository holds no literal credentials.
const token = (seed: number): string => fakeBody(32, seed);
const stripeLive = FAKE_PROVIDER_SECRETS.find(([name]) => name === "Stripe live key")?.[1] ?? "";

const cases: RuleCases = {
  valid: [
    {
      name: "UI label that mentions a password",
      code: `export const passwordLabel = "Enter your password";\nexport const tokenType = "bearer-token";\n`,
    },
    {
      name: "header, route and storage names for auth",
      code: `export const authRoute = "/auth/login";\nexport const apiKeyHeader = "X-Api-Key";\nexport const tokenStorageKey = "app.session.token";\n`,
    },
    {
      name: "author is not a secret",
      code: `export const author = "${token(41)}";\nexport const authorName = "${token(42)}";\n`,
    },
    {
      name: "public and publishable keys",
      code: `export const publicKey = "${token(43)}";\nexport const recaptchaSiteKey = "${token(44)}";\nexport const publishableKey = "${token(45)}";\n`,
    },
    {
      name: "short or placeholder values",
      code: `export const token1 = "abc";\nexport const apiKey = "your-api-key-here";\nexport const secret = "<your-secret>";\nexport const password = "changeme";\nexport const clientSecret = "xxxxxxxxxxxxxxxxxxxxxxxx";\n`,
    },
    {
      name: "secret read from the environment at runtime",
      code: `export const apiKey = import.meta.env.VITE_PUBLIC_KEY;\nexport const secret = process.env.API_SECRET ?? "";\n`,
    },
    {
      name: "long identifier-like strings without digits",
      code: `export const secretName = "this_is_a_very_long_snake_case_name";\nexport const tokenKey = "user-session-token-key-name";\n`,
    },
    {
      name: "Supabase anon key under a token name",
      code: `export const token = "${fakeJwt({ role: "anon" }, 46)}";\n`,
    },
    {
      name: "hardcoded secrets in server code are not guessed from names",
      filename: "server/api/hook.post.ts",
      code: `export const apiSecret = "${token(47)}";\n`,
    },
    {
      name: "build config values are not guessed from names",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ runtimeConfig: { apiSecret: "${token(48)}" } });\n`,
    },
  ],
  invalid: [
    { name: "camelCase apiKey (skipped by the 1.x allow-list)", code: `export const apiKey = "${token(51)}";\n` },
    { name: "SCREAMING_CASE secret", code: `export const API_SECRET_KEY = "${token(52)}";\n` },
    { name: "snake_case client secret", code: `export const client_secret = "${token(53)}";\n` },
    { name: "kebab-case property", code: `export const headers = { "x-api-key": "${token(54)}" };\n` },
    { name: "object property", code: `export const config = { authToken: "${token(55)}" };\n` },
    { name: "assignment to a member", code: `const client = {};\nclient.accessToken = "${token(56)}";\n` },
    { name: "default parameter", code: `export const connect = (secret = "${token(57)}") => secret;\n` },
    { name: "template literal without expressions", code: `export const apiKey = \`${token(58)}\`;\n` },
    { name: "class field", code: `export class Api {\n  privateKey = "${token(59)}";\n}\n` },
    { name: "hard-coded password", code: `const password = "hunter2hunter2";\nexport { password };\n` },
    {
      name: "Authorization header with a bearer token",
      code: `export const headers = { Authorization: "Bearer ${token(60)}" };\n`,
    },
    {
      name: "JWT assigned to a token name",
      code: `export const sessionToken = "${fakeJwt({ sub: "user-1", role: "authenticated" }, 61)}";\n`,
    },
    {
      name: "provider key committed in server code",
      filename: "server/api/charge.post.ts",
      code: `export const stripe = "${stripeLive}";\n`,
    },
    {
      name: "provider key committed in build config",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ runtimeConfig: { stripeKey: "${stripeLive}" } });\n`,
    },
    {
      name: "provider key in a test file",
      filename: "src/billing.spec.ts",
      code: `export const stripe = "${stripeLive}";\n`,
    },
  ],
};

export default cases;
