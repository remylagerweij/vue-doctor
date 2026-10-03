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
      name: "console.warn in server middleware",
      filename: "server/middleware/auth.ts",
      code: `export default defineEventHandler((event) => {\n  console.warn("no session");\n});\n`,
    },
    {
      name: "console.info in a server route",
      filename: "server/routes/health.ts",
      code: `export default defineEventHandler(() => {\n  console.info("health check");\n  return "ok";\n});\n`,
    },
  ],
};

export default cases;
