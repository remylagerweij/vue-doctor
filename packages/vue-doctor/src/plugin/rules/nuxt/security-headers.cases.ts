import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "safe nuxt config with disabled devtools",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({
  devtools: { enabled: false },
  sourcemap: { client: false },
});
`,
    },
    {
      name: "default empty nuxt config",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({
  modules: ["@nuxtjs/tailwindcss"],
});
`,
    },
    {
      name: "non-config file",
      filename: "src/utils/config.ts",
      code: `export const devtools = { enabled: true };
`,
    },
    {
      name: "server sourcemap only",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({
  sourcemap: { server: true, client: false },
});
`,
    },
  ],
  invalid: [
    {
      name: "devtools enabled explicitly",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({
  devtools: { enabled: true },
});
`,
    },
    {
      name: "sourcemap client true",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({
  sourcemap: { client: true },
});
`,
    },
    {
      name: "routeRules cors true",
      filename: "nuxt.config.ts",
      code: `export default defineNuxtConfig({
  routeRules: {
    "/api/**": { cors: true },
  },
});
`,
    },
  ],
};

export default cases;
