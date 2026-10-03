import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "secrets in the server-only part of runtimeConfig",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({\n  runtimeConfig: {\n    stripeSecretKey: process.env.STRIPE_SECRET_KEY,\n    apiToken: "",\n    public: { apiBase: "/api" },\n  },\n});\n`,
    },
    {
      name: "public values that are public by design",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({\n  runtimeConfig: {\n    public: {\n      siteUrl: "https://example.com",\n      supabaseAnonKey: "",\n      stripePublishableKey: "pk_live_abc123",\n      recaptchaSiteKey: "",\n      mapboxToken: "",\n      tokenUrl: "/auth/token",\n    },\n  },\n});\n`,
    },
    {
      name: "a bare apiKey is not flagged (analytics and maps keys are public)",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ runtimeConfig: { public: { gaApiKey: "", firebase: { apiKey: "" } } } });\n`,
    },
    {
      name: "secret-looking keys outside runtimeConfig.public",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ app: { head: { title: "App" } }, routeRules: { "/api/**": { headers: { "x-token": "a" } } } });\n`,
    },
    {
      name: "files other than nuxt.config are not checked",
      filename: "src/config.ts",
      code: `export default { runtimeConfig: { public: { apiSecret: "" } } };\n`,
    },
    {
      name: "app.config with ordinary values and design tokens",
      filename: "app.config.ts",
      code: `export default defineAppConfig({ title: "App", ui: { tokens: { radius: "4px" }, primary: "green" } });\n`,
    },
  ],
  invalid: [
    {
      name: "secret-named keys in runtimeConfig.public",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({\n  runtimeConfig: {\n    public: { stripeSecretKey: "", adminPassword: "", authToken: process.env.AUTH_TOKEN },\n  },\n});\n`,
      count: 3,
    },
    {
      name: "nested object under public",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ runtimeConfig: { public: { mail: { sendgridApiKey: "" } } } });\n`,
    },
    {
      name: "a value in the format of a provider secret under any name",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ runtimeConfig: { public: { billing: "sk_live_4eC39HqLyjWDarjtT1zdp7dc" } } });\n`,
    },
    {
      name: "a secret group in public",
      filename: "nuxt.config.js",
      code: `export default { runtimeConfig: { public: { credentials: { user: "a", pass: "b" } } } };\n`,
    },
    {
      name: "runtimeConfig inside an environment override",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ $production: { runtimeConfig: { public: { clientSecret: "" } } } });\n`,
    },
    {
      name: "secret in app.config, which is fully public",
      filename: "app.config.ts",
      code: `export default defineAppConfig({ analytics: { apiSecret: "abc" } });\n`,
    },
  ],
};

export default cases;
