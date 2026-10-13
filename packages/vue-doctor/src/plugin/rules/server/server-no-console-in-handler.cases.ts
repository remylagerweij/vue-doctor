import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "structured logger in an API route",
      filename: "server/api/users.get.ts",
      code: `export default defineEventHandler(() => {\n  consola.info("listing users");\n  return [];\n});\n`,
    },
    {
      name: "console.error is allowed for failures",
      filename: "server/api/users.get.ts",
      code: `export default defineEventHandler(() => {\n  console.error("db down");\n  return [];\n});\n`,
    },
    {
      name: "console.warn on a degraded path is operational logging",
      filename: "server/api/recommendations/index.get.ts",
      code: `export default defineEventHandler(async () => {\n  try {\n    return await rank();\n  } catch (error) {\n    console.warn("[Recommendations] ranking failed, serving defaults", error);\n    return [];\n  }\n});\n`,
    },
    {
      name: "console.info in a server route",
      filename: "server/routes/health.ts",
      code: `export default defineEventHandler(() => {\n  console.info("health check");\n  return "ok";\n});\n`,
    },
    {
      name: "console.log in client code",
      filename: "src/utils/logger.ts",
      code: `export const log = (message: string) => console.log(message);\n`,
    },
    {
      name: "server utility outside handler folders",
      filename: "server/utils/db.ts",
      code: `export const connect = () => { console.log("connecting"); };\n`,
    },
  ],
  invalid: [
    {
      name: "console.log in an API route",
      filename: "server/api/users.get.ts",
      code: `export default defineEventHandler(() => {\n  console.log("listing users");\n  return [];\n});\n`,
    },
    {
      name: "console.log printing what a user searched for",
      filename: "server/api/geocode.get.ts",
      code: `export default defineEventHandler(async (event) => {\n  const { street, city } = getQuery(event);\n  console.log(\`[Geocode] looking up \${street}, \${city}\`);\n  return lookup(street, city);\n});\n`,
    },
    {
      name: "console.debug in server middleware",
      filename: "server/middleware/auth.ts",
      code: `export default defineEventHandler((event) => {\n  console.debug("no session");\n});\n`,
    },
    {
      name: "console.trace in a server route",
      filename: "server/routes/health.ts",
      code: `export default defineEventHandler(() => {\n  console.trace("health check");\n  return "ok";\n});\n`,
    },
  ],
};

export default cases;
