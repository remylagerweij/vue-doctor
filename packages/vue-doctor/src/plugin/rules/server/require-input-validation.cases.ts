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
    {
      name: "safeParse of an awaited readBody",
      filename: "server/api/members/[id].patch.ts",
      code: `export default defineEventHandler(async (event) => {
  const parsed = MemberPatchSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400 });
  return update(parsed.data);
});
`,
    },
    {
      name: "readBody bound first, then safeParse",
      filename: "server/api/auth/login.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const result = LoginSchema.safeParse(body);
  if (!result.success) throw createError({ statusCode: 400 });
  return login(result.data);
});
`,
    },
    {
      name: "parse of a nested readBody",
      filename: "server/api/admin/content/[id].put.ts",
      code: `export default defineEventHandler(async (event) => {
  const input = ContentSchema.parse(await readBody(event));
  return save(input);
});
`,
    },
    {
      name: "parseAsync and safeParseAsync",
      filename: "server/api/items.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const a = await A.parseAsync(await readBody(event));
  const b = await B.safeParseAsync(getQuery(event));
  return { a, b };
});
`,
    },
    {
      name: "router param inside an object passed to safeParse",
      filename: "server/api/vehicles/[kenteken].get.ts",
      code: `export default defineEventHandler(async (event) => {
  const params = PlateParamsSchema.safeParse({ kenteken: getRouterParam(event, "kenteken", { decode: true }) ?? "" });
  if (!params.success) throw createError({ statusCode: 400 });
  return lookup(params.data.kenteken);
});
`,
    },
    {
      name: "readBody with .catch fallback, then safeParse",
      filename: "server/api/session/claim.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) throw createError({ statusCode: 400 });
  return claim(parsed.data);
});
`,
    },
    {
      name: "parseInt of a param with a fallback",
      filename: "server/api/dealers/[id].get.ts",
      code: `export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, "id");
  const id = parseInt(idParam || "0", 10);
  if (Number.isNaN(id) || id <= 0) throw createError({ statusCode: 400 });
  return getDealer(id);
});
`,
    },
    {
      name: "raw body and signature headers handed to a webhook verifier",
      filename: "server/api/auth/send-email.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, "utf8");
  if (!rawBody) return fail(event, 400);
  verifyStandardWebhook({
    payload: rawBody,
    headers: {
      id: getHeader(event, "webhook-id"),
      timestamp: getHeader(event, "webhook-timestamp"),
      signature: getHeader(event, "webhook-signature"),
    },
    secret,
  });
  return send(rawBody);
});
`,
    },
    {
      name: "helper handed the signature header verifies the payload",
      filename: "server/api/auth/send-email.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event, "utf8")) ?? null;
  return handleAuthEmailHook(rawBody, {
    id: getHeader(event, "webhook-id"),
    timestamp: getHeader(event, "webhook-timestamp"),
    signature: getHeader(event, "webhook-signature"),
  });
});
`,
    },
    {
      name: "Stripe constructEvent",
      filename: "server/api/premium/webhook.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readRawBody(event);
  const signature = getHeader(event, "stripe-signature");
  const stripeEvent = stripe.webhooks.constructEvent(body, signature, secret);
  return handle(stripeEvent);
});
`,
    },
    {
      name: "raw body passed to a same-file function that narrows it",
      filename: "server/api/api-keys/index.post.ts",
      code: `function readIssueRequest(body: unknown) {
  if (typeof body !== "object" || body === null) throw createError({ statusCode: 400 });
  return body as { label: string };
}
export default defineEventHandler(async (event) => {
  const { label } = readIssueRequest(await readBody(event));
  return issue(label);
});
`,
    },
    {
      name: "multipart parts filtered, then checked",
      filename: "server/api/user/avatar.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event);
  const files = (parts ?? []).filter((part) => part.name === "file");
  const file = files[0];
  if (files.length !== 1 || !file?.data?.length) throw createError({ statusCode: 400 });
  return validateAvatar(file.data);
});
`,
    },
    {
      name: "router param with a presence check that throws",
      filename: "server/api/admin/tco/[id].get.ts",
      code: `export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing TCO record ID" });
  }
  return findTco(id);
});
`,
    },
    {
      name: "query value switched over with a default",
      filename: "server/api/admin/financials/stats.get.ts",
      code: `export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const period = query.period as string;
  switch (period) {
    case "30d":
      return stats(30);
    default:
      return stats(7);
  }
});
`,
    },
    {
      name: "project validator listed in the validators option",
      filename: "server/api/premium/index.post.ts",
      options: { validators: ["checkedBody"] },
      code: `export default defineEventHandler(async (event) => {
  const body = checkedBody(await readBody(event), PlanSchema);
  return create(body);
});
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
    {
      name: "cast is not validation, nor is a presence check of a body field",
      filename: "server/api/premium/create-payment-intent.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { planId } = body as { planId: string };
  if (!planId) throw createError({ statusCode: 400, statusMessage: "Plan ID is required" });
  return createIntent(planId);
});
`,
    },
    {
      name: "query value cast and only checked for presence",
      filename: "server/api/admin/users/[id]/emails.get.ts",
      code: `export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const userEmail = query.email as string;
  if (!userEmail) throw createError({ statusCode: 400 });
  return fetchEmails(userEmail);
});
`,
    },
    {
      name: "router param without a check that rejects it",
      filename: "server/api/admin/users/[id]/ban.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) console.warn("missing id");
  return ban(id);
});
`,
    },
    {
      name: "helper that does not check its parameter",
      filename: "server/api/notes.post.ts",
      code: `function toNote(body: unknown) {
  return { text: (body as { text: string }).text };
}
export default defineEventHandler(async (event) => {
  return save(toNote(await readBody(event)));
});
`,
    },
    {
      name: "validators option does not cover other functions",
      filename: "server/api/premium/index.post.ts",
      options: { validators: ["checkedBody"] },
      code: `export default defineEventHandler(async (event) => {
  const body = toPlan(await readBody(event));
  return create(body);
});
`,
    },
  ],
};

export default cases;
