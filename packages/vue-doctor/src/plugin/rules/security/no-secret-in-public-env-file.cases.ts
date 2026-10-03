import type { FsRuleCases } from "../../fs-rule-cases.js";

const cases: FsRuleCases = {
  valid: [
    {
      name: "public variables that are public by design",
      files: {
        ".env": "VITE_SUPABASE_URL=https://x.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGciOi\nNUXT_PUBLIC_SITE_URL=https://example.com\nVITE_STRIPE_PUBLISHABLE_KEY=pk_live_abc\n",
      },
    },
    {
      name: "secrets in non-public variables",
      files: { ".env": "STRIPE_SECRET_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\nDB_PASSWORD=hunter2\nNUXT_API_SECRET=abc\n" },
    },
    {
      name: "a bare API key and descriptors in public variables",
      files: { ".env": "VITE_GOOGLE_MAPS_API_KEY=abc\nVITE_AUTH_TOKEN_URL=/token\nPUBLIC_RECAPTCHA_SITE_KEY=abc\n" },
    },
    {
      name: "commented-out lines and non-env files",
      files: { ".env": "# VITE_SECRET_KEY=abc\n", "src/env.ts": "export const VITE_SECRET_KEY = 'abc';\n" },
    },
    {
      name: "no env files at all",
      files: { "package.json": "{}" },
    },
  ],
  invalid: [
    {
      name: "VITE_ secret in .env points at the defining line",
      files: { ".env": "VITE_API_URL=/api\nVITE_STRIPE_SECRET_KEY=sk_test_abc\n" },
      findings: [{ file: ".env", line: 2 }],
    },
    {
      name: "git-ignored env files are still bundled",
      files: { ".env.local": "NUXT_PUBLIC_ADMIN_TOKEN=abc\n", ".gitignore": ".env.local\n" },
      ignored: [".env.local"],
      findings: [{ file: ".env.local", line: 1 }],
    },
    {
      name: "env templates document the wrong design too, with export and quotes",
      files: { ".env.example": "export VITE_JWT_SECRET=\"\"\nPUBLIC_DB_PASSWORD=\nVUE_APP_SERVICE_ROLE_KEY=\n" },
      findings: [
        { file: ".env.example", line: 1 },
        { file: ".env.example", line: 2 },
        { file: ".env.example", line: 3 },
      ],
    },
    {
      name: "a secret value format in a public variable with a harmless name",
      files: { ".env.production": "VITE_BILLING=sk_live_4eC39HqLyjWDarjtT1zdp7dc\n" },
      findings: [{ file: ".env.production", line: 1 }],
    },
    {
      name: "env files in sub-directories",
      files: { "apps/web/.env.development": "VITE_OPENAI_API_KEY=sk-abc\n" },
      findings: [{ file: "apps/web/.env.development", line: 1 }],
    },
  ],
};

export default cases;
