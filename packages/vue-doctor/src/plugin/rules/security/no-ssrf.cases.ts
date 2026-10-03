import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "fetch to fixed domain with validated id",
      filename: "server/api/users.ts",
      code: `export default defineEventHandler((event) => {
  const id = getRouterParam(event, "id");
  if (id && /^\\d+$/.test(id)) {
    return $fetch(\`https://api.internal/users/\${id}\`);
  }
});
`,
    },
    {
      name: "parsed URL with checked hostname",
      filename: "server/api/proxy.ts",
      code: `export default defineEventHandler(async (event) => {
  const { target } = await readBody(event);
  const parsed = new URL(target);
  if (parsed.protocol === "https:" && ["api.example.com"].includes(parsed.hostname)) {
    return $fetch(parsed.toString());
  }
});
`,
    },
    {
      name: "static URL fetch in server handler",
      filename: "server/api/weather.ts",
      code: `export default defineEventHandler(() => {
  return $fetch("https://api.weather.com/v1");
});
`,
    },
    {
      name: "fetch in client code (rule only targets server)",
      filename: "pages/index.vue",
      code: `export const load = (userUrl) => {
  fetch(userUrl);
};
`,
    },
  ],
  invalid: [
    {
      name: "$fetch with query url parameter",
      filename: "server/api/proxy.ts",
      code: `export default defineEventHandler((event) => {
  const query = getQuery(event);
  return $fetch(query.url);
});
`,
    },
    {
      name: "proxyRequest with request body target",
      filename: "server/api/forward.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return proxyRequest(event, body.targetUrl);
});
`,
    },
    {
      name: "axios.get with router param url",
      filename: "server/routes/fetch.ts",
      code: `export default defineEventHandler((event) => {
  const destination = getRouterParam(event, "dest");
  return axios.get(destination);
});
`,
    },
    {
      name: "fetch with baseURL from header",
      filename: "server/api/client.ts",
      code: `export default defineEventHandler((event) => {
  const endpoint = getHeader(event, "x-api-endpoint");
  return $fetch("/status", { baseURL: endpoint });
});
`,
    },
  ],
};

export default cases;
