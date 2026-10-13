import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "mutating route with csrf check",
      filename: "server/api/transfer.post.ts",
      code: `export default defineEventHandler(async (event) => {
  await requireUserSession(event);
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
  const session = getCookie(event, "session");
  const body = await readBody(event);
  return processStripe(body, session);
});
`,
    },
    {
      name: "GET route reading the session",
      filename: "server/api/data.get.ts",
      code: `export default defineEventHandler(async (event) => {
  const user = await requireUserSession(event);
  return { user };
});
`,
    },
    {
      name: "mutating route comparing the origin header",
      filename: "server/api/action.post.ts",
      code: `export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const origin = getHeader(event, "origin");
  if (origin !== "https://myapp.com") throw createError({ statusCode: 403 });
  const body = await readBody(event);
  return { done: true };
});
`,
    },
    {
      name: "token in the body and no ambient session",
      filename: "server/api/user/unsubscribe/index.patch.ts",
      code: `export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, S.parse);
  return unsubscribe(verifyUnsubscribeToken(token));
});
`,
    },
    {
      name: "credentials in the body of a login route",
      filename: "server/api/auth/login.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, LoginSchema.parse);
  return signIn(email, password);
});
`,
    },
    {
      name: "signature-verified hook not named webhook",
      filename: "server/api/auth/send-email.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event);
  const rawBody = await readRawBody(event, "utf8");
  verifyStandardWebhook({ payload: rawBody, signature: getHeader(event, "webhook-signature") });
  return send(client, rawBody);
});
`,
    },
    {
      name: "authenticated by a header secret",
      filename: "server/api/cron/digest.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event);
  if (getHeader(event, "authorization") !== \`Bearer \${process.env.CRON_SECRET}\`) throw createError({ statusCode: 401 });
  return runDigest(client);
});
`,
    },
    {
      name: "explicit JSON content-type assertion",
      filename: "server/api/profile.patch.ts",
      code: `export default defineEventHandler(async (event) => {
  const user = await requireUserSession(event);
  if (getRequestHeader(event, "content-type") !== "application/json") throw createError({ statusCode: 415 });
  return update(user, await readBody(event));
});
`,
    },
    {
      name: "session cookie is SameSite=Lax (inferred from nuxt.config)",
      filename: "server/api/admin/users/[id]/ban.post.ts",
      options: { sessionFunctions: ["ensureAdmin"], sessionCookieSameSite: "lax" },
      code: `export default defineEventHandler(async (event) => {
  await ensureAdmin(event);
  return ban(getRouterParam(event, "id"));
});
`,
    },
    {
      name: "project already rejects cross-site requests",
      filename: "server/api/members/[id].patch.ts",
      options: { csrfProtection: true },
      code: `export default defineEventHandler(async (event) => {
  const { client } = await requireOrganizationContext(event);
  return client.from("members").update(await readBody(event));
});
`,
    },
  ],
  invalid: [
    {
      name: "cookie session and state change without a body read",
      filename: "server/api/admin/users/[id]/ban.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const user = await requireUserSession(event);
  await ban(getRouterParam(event, "id"));
  return { ok: true };
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
      name: "project session helper with a SameSite=None cookie",
      filename: "server/api/user/avatar.post.ts",
      options: { sessionFunctions: ["ensureUser"], sessionCookieSameSite: "none" },
      code: `export default defineEventHandler(async (event) => {
  const user = await ensureUser(event);
  const form = await readFormData(event);
  return handleUpload(user, form);
});
`,
    },
    {
      name: "URL origin used to build a link is not an Origin check",
      filename: "server/api/invite.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const user = await getUserSession(event);
  const link = \`\${getRequestURL(event).origin}/accept\`;
  return sendInvite(user, link, await readBody(event));
});
`,
    },
    {
      name: "JSON body is not a mitigation",
      filename: "server/api/roles/index.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event);
  const { role } = await readValidatedBody(event, z.object({ role: z.enum(["admin", "member"]) }).parse);
  return client.from("roles").insert({ role });
});
`,
    },
    {
      name: "SameSite=Lax reported when asked to",
      filename: "server/api/operator/settings.put.ts",
      options: { sessionCookieSameSite: "lax", reportSameSiteLax: true },
      code: `export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event);
  return client.from("settings").update(await readBody(event));
});
`,
    },
  ],
};

export default cases;
