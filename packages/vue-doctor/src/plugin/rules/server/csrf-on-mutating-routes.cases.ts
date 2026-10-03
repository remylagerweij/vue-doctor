import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "mutating route with csrf check",
      filename: "server/api/transfer.post.ts",
      code: `export default defineEventHandler(async (event) => {
  await verifyCsrfToken(event);
  const body = await readBody(event);
  return doTransfer(body);
});
`,
    },
    {
      name: "webhook route (exempt from CSRF)",
      filename: "server/api/stripe-webhook.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return processStripe(body);
});
`,
    },
    {
      name: "GET route reading no body/cookies",
      filename: "server/api/data.get.ts",
      code: `export default defineEventHandler(() => {
  return { status: "ok" };
});
`,
    },
    {
      name: "mutating route checking origin header",
      filename: "server/api/action.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const origin = getHeader(event, "origin");
  if (origin !== "https://myapp.com") throw createError({ statusCode: 403 });
  const body = await readBody(event);
  return { done: true };
});
`,
    },
  ],
  invalid: [
    {
      name: "POST route reading body without CSRF protection",
      filename: "server/api/update-profile.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return updateUser(body);
});
`,
    },
    {
      name: "DELETE route using cookies and no CSRF protection",
      filename: "server/api/item.delete.ts",
      code: `export default defineEventHandler((event) => {
  const cookie = getCookie(event, "session");
  return deleteItem();
});
`,
    },
    {
      name: "PUT route with readFormData without CSRF",
      filename: "server/api/upload.put.ts",
      code: `export default defineEventHandler(async (event) => {
  const form = await readFormData(event);
  return handleUpload(form);
});
`,
    },
  ],
};

export default cases;
