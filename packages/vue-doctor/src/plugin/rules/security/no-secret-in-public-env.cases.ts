import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "public variables that are public by design",
      code: `export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);\nexport const stripe = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);\nexport const site = process.env.NUXT_PUBLIC_SITE_URL;\n`,
    },
    {
      name: "server route reads a secret from a server-only variable",
      filename: "server/api/pay.post.ts",
      code: `export default defineEventHandler(() => {\n  const key = process.env.STRIPE_SECRET_KEY;\n  const config = useRuntimeConfig();\n  return { ok: Boolean(key && config.stripeSecretKey) };\n});\n`,
    },
    {
      name: "non-public runtime config key",
      code: `const config = useRuntimeConfig();\nexport const key = config.apiSecret;\nexport const base = config.public.apiBase;\n`,
    },
    {
      name: "a bare API key in a public variable (maps, analytics)",
      code: `export const maps = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;\nexport const firebase = useRuntimeConfig().public.firebaseApiKey;\n`,
    },
    {
      name: "built-in Vite variables",
      code: `export const mode = import.meta.env.MODE;\nexport const dev = import.meta.env.DEV;\n`,
    },
    {
      name: "descriptors of a token, not the token",
      code: `export const url = import.meta.env.VITE_AUTH_TOKEN_URL;\nexport const csrf = process.env.NUXT_PUBLIC_CSRF_TOKEN;\n`,
    },
  ],
  invalid: [
    {
      name: "Vite secret read through import.meta.env",
      code: `export const key = import.meta.env.VITE_STRIPE_SECRET_KEY;\n`,
    },
    {
      name: "NUXT_PUBLIC secret read through process.env",
      code: `export const token = process.env.NUXT_PUBLIC_ADMIN_TOKEN;\nexport const other = process["env"]["VITE_DB_PASSWORD"];\n`,
      count: 2,
    },
    {
      name: "secret in the public runtime config",
      code: `const config = useRuntimeConfig();\nexport const secret = config.public.clientSecret;\nexport const token = useRuntimeConfig().public.authToken;\n`,
      count: 2,
    },
    {
      name: "destructured reads",
      code: `const { VITE_OPENAI_API_KEY } = import.meta.env;\nconst { public: { privateKey } } = useRuntimeConfig();\n`,
      count: 2,
    },
    {
      name: "bracket access and an alias of the public config",
      code: `const pub = useRuntimeConfig().public;\nexport const a = pub.webhookSecret;\nexport const b = import.meta.env["VITE_JWT_SECRET"];\n`,
      count: 2,
    },
  ],
};

export default cases;
