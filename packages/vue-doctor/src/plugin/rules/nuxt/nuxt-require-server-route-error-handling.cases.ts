import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "handler wrapped in try/catch",
      filename: "server/api/users.get.ts",
      code: `export default defineEventHandler(async (event) => {\n  try {\n    return await db.users();\n  } catch (error) {\n    throw createError({ statusCode: 500 });\n  }\n});\n`,
    },
    {
      name: "expression-bodied handler has nothing to wrap",
      filename: "server/api/ping.get.ts",
      code: `export default defineEventHandler(() => "pong");\n`,
    },
    {
      name: "same code outside the server directory",
      filename: "src/composables/handler.ts",
      code: `export default defineEventHandler(async (event) => {\n  return 1;\n});\n`,
    },
    {
      name: "named export is not a route handler default export",
      filename: "server/utils/session.ts",
      code: `export const handler = defineEventHandler(async (event) => {\n  return 1;\n});\n`,
    },
  ],
  invalid: [
    {
      name: "async arrow handler without try/catch",
      filename: "server/api/users.get.ts",
      code: `export default defineEventHandler(async (event) => {\n  return await db.users();\n});\n`,
    },
    {
      name: "function expression handler",
      filename: "server/routes/health.ts",
      code: `export default defineEventHandler(function (event) {\n  const body = readBody(event);\n  return body;\n});\n`,
    },
    {
      name: "handler in a nested server api folder",
      filename: "app/server/api/orders/[id].delete.ts",
      code: `export default defineEventHandler(async (event) => {\n  await db.remove(getRouterParam(event, "id"));\n  return { ok: true };\n});\n`,
    },
  ],
};

export default cases;
