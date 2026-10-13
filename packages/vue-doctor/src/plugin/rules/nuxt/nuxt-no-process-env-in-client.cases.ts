import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "runtime config in a component",
      filename: "app/components/Comp.vue",
      code: `<script setup>\nconst config = useRuntimeConfig();\nconst base = config.public.apiBase;\n</script>\n`,
    },
    {
      name: "Vite build-time env",
      filename: "app/composables/useMode.ts",
      code: `export const mode = import.meta.env.MODE;\n`,
    },
    {
      name: "other process properties",
      filename: "app/utils/runtime.ts",
      code: `export const version = process.version;\nexport const cwd = process.cwd();\n`,
    },
    {
      name: "server route reads secrets from the environment",
      filename: "server/api/token.get.ts",
      code: `export default defineEventHandler(() => ({ key: process.env.API_SECRET }));\n`,
    },
    {
      name: "nuxt.config is evaluated at build time",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({ runtimeConfig: { apiSecret: process.env.API_SECRET } });\n`,
    },
    {
      name: "tool config files run in Node",
      filename: "tailwind.config.ts",
      code: `export default { content: [], darkMode: process.env.DARK ? "class" : "media" };\n`,
    },
    {
      name: "any server directory, including utils",
      filename: "server/utils/db.ts",
      code: `export const url = process.env.DATABASE_URL;\n`,
    },
    {
      name: "server directory of a nested app",
      filename: "apps/web/server/lib/db.ts",
      code: `export const url = process.env.DATABASE_URL;\n`,
    },
    {
      name: "command-line script next to the app (mw-fe scripts/backup-supabase-tco.ts)",
      filename: "scripts/backup-supabase-tco.ts",
      code: `const url = process.env.SUPABASE_URL;\nconst key = process.env.SUPABASE_SECRET_KEY;\nexport { url, key };\n`,
    },
    {
      name: "script helpers in a utils folder under scripts",
      filename: "scripts/utils/env.ts",
      code: `export const token = process.env.API_TOKEN;\n`,
    },
    {
      name: "bin entry point",
      filename: "bin/cli.mjs",
      code: `console.log(process.env.HOME);\n`,
    },
    {
      name: "shared code is treated as server-side",
      filename: "shared/utils/flags.ts",
      code: `export const flag = process.env.FEATURE_FLAG;\n`,
    },
    {
      name: "server-only plugin",
      filename: "app/plugins/session.server.ts",
      code: `export default defineNuxtPlugin(() => ({ secret: process.env.SESSION_SECRET }));\n`,
    },
    {
      name: "test files run in Node",
      filename: "app/utils/env.test.ts",
      code: `export const baseUrl = process.env.BASE_URL;\n`,
    },
    {
      name: "NODE_ENV is replaced at build time",
      filename: "app/utils/env.ts",
      code: `export const isProd = process.env.NODE_ENV === "production";\nexport const mode = process.env["NODE_ENV"];\n`,
    },
  ],
  invalid: [
    {
      name: "process.env in a component",
      filename: "app/components/Comp.vue",
      code: `<script setup>\nconst api = process.env.API_URL;\n</script>\n`,
    },
    {
      name: "process.env in a composable",
      filename: "app/composables/useApi.ts",
      code: `export const useApi = () => ({ base: process.env.API_BASE });\n`,
    },
    {
      name: "computed property access in app utils",
      filename: "app/utils/env.ts",
      code: `export const flag = process.env["FEATURE_FLAG"];\n`,
    },
    {
      name: "client plugin of the app",
      filename: "app/plugins/analytics.client.ts",
      code: `export default defineNuxtPlugin(() => ({ id: process.env.ANALYTICS_ID }));\n`,
    },
    {
      name: "Nuxt 3 root-level page",
      filename: "pages/index.vue",
      code: `<script setup>\nconst base = process.env.API_BASE;\n</script>\n`,
    },
    {
      name: "root app.vue",
      filename: "app.vue",
      code: `<script setup>\nconst id = process.env.SITE_ID;\n</script>\n`,
    },
    {
      name: "route middleware of the app",
      filename: "app/middleware/auth.ts",
      code: `export default defineNuxtRouteMiddleware(() => { if (!process.env.AUTH_URL) return; });\n`,
    },
    {
      name: "layer component under src/components",
      filename: "packages/ui/src/components/Badge.vue",
      code: `<script setup>\nconst theme = process.env.THEME;\n</script>\n`,
    },
  ],
};

export default cases;
