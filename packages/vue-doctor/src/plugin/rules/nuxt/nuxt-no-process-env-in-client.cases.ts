import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "runtime config in a component",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst config = useRuntimeConfig();\nconst base = config.public.apiBase;\n</script>\n`,
    },
    {
      name: "Vite build-time env",
      code: `export const mode = import.meta.env.MODE;\n`,
    },
    {
      name: "other process properties",
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
      name: "server directory outside api/routes (utils, tasks, db)",
      filename: "server/tasks/sync.ts",
      code: `export default defineTask({ run: () => ({ result: process.env.SYNC_TOKEN }) });\n`,
    },
    {
      name: "server directory of a nested app",
      filename: "apps/web/server/utils/db.ts",
      code: `export const url = process.env.DATABASE_URL;\n`,
    },
    {
      name: "test files run in Node",
      filename: "src/utils/env.test.ts",
      code: `export const baseUrl = process.env.BASE_URL;\n`,
    },
    {
      name: "NODE_ENV is replaced at build time",
      filename: "src/utils/env.ts",
      code: `export const isProd = process.env.NODE_ENV === "production";\nexport const mode = process.env["NODE_ENV"];\n`,
    },
  ],
  invalid: [
    {
      name: "process.env in a component",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst api = process.env.API_URL;\n</script>\n`,
    },
    {
      name: "process.env in a composable",
      code: `export const useApi = () => ({ base: process.env.API_BASE });\n`,
    },
    {
      name: "computed property access",
      filename: "src/utils/env.ts",
      code: `export const flag = process.env["FEATURE_FLAG"];\n`,
    },
    {
      name: "a directory that only contains the word server in its name",
      filename: "src/webserver/client.ts",
      code: `export const host = process.env.API_HOST;\n`,
    },
    {
      name: "client plugin of the app",
      filename: "plugins/analytics.client.ts",
      code: `export default defineNuxtPlugin(() => ({ id: process.env.ANALYTICS_ID }));\n`,
    },
  ],
};

export default cases;
