import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "getValidatedQuery with schema parse",
      filename: "server/api/search.ts",
      code: `import { z } from "zod";
const schema = z.object({ q: z.string() });
export default defineEventHandler((event) => {
  const query = getValidatedQuery(event, schema.parse);
  return query.q;
});
`,
    },
    {
      name: "readValidatedBody with schema parse",
      filename: "server/api/items.post.ts",
      code: `import { z } from "zod";
const ItemSchema = z.object({ title: z.string() });
export default defineEventHandler(async (event) => {
  const item = await readValidatedBody(event, ItemSchema.parse);
  return item;
});
`,
    },
    {
      name: "raw readBody followed by manual check",
      filename: "server/api/user.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (typeof body.name === "string" && body.name.length > 0) {
    return { ok: true };
  }
  throw createError({ statusCode: 400 });
});
`,
    },
    {
      name: "raw getRouterParam coerced to Number",
      filename: "server/api/users/[id].ts",
      code: `export default defineEventHandler((event) => {
  const idStr = getRouterParam(event, "id");
  const id = Number(idStr);
  if (!Number.isNaN(id)) {
    return { id };
  }
});
`,
    },
    {
      name: "client code using getQuery-like helper",
      filename: "src/utils/url.ts",
      code: `export const parse = (event) => {
  const q = getQuery(event);
  return q;
};
`,
    },
  ],
  invalid: [
    {
      name: "raw getQuery returned directly",
      filename: "server/api/search.ts",
      code: `export default defineEventHandler((event) => {
  const query = getQuery(event);
  return query;
});
`,
    },
    {
      name: "raw readBody without validation",
      filename: "server/api/posts.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return saveToDatabase(body);
});
`,
    },
    {
      name: "getRouterParam used directly",
      filename: "server/api/item/[slug].ts",
      code: `export default defineEventHandler((event) => {
  const slug = getRouterParam(event, "slug");
  return findBySlug(slug);
});
`,
    },
    {
      name: "destructured readBody without validation",
      filename: "server/api/login.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const { username, password } = await readBody(event);
  return authenticate(username, password);
});
`,
    },
  ],
};

export default cases;
