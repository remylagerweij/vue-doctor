import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "admin route with requireUserSession",
      filename: "server/api/admin/users.get.ts",
      code: `export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  return [];
});
`,
    },
    {
      name: "mutating route with auth check",
      filename: "server/api/profile.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  return { updated: true };
});
`,
    },
    {
      name: "intentionally public login post route",
      filename: "server/api/auth/login.post.ts",
      code: `export default defineEventHandler(async (event) => {
  return { token: "abc" };
});
`,
    },
    {
      name: "read-only GET endpoint outside admin",
      filename: "server/api/posts.get.ts",
      code: `export default defineEventHandler(() => {
  return [{ id: 1 }];
});
`,
    },
    {
      name: "project guard named like ensureAdmin",
      filename: "server/api/admin/premium/[id].delete.ts",
      code: `export default defineEventHandler(async (event) => {
  await ensureAdmin(event);
  return deletePlan(getRouterParam(event, "id"));
});
`,
    },
    {
      name: "project guards named requirePlatformOperator and requireOrganizationContext",
      filename: "server/api/operator/organizations/index.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const { client } = await requirePlatformOperator(event);
  const { organizationId } = await requireOrganizationContext(event);
  return createOrganization(client, organizationId);
});
`,
    },
    {
      name: "guard listed in the authFunctions option",
      filename: "server/api/admin/stats.get.ts",
      options: { authFunctions: ["gatekeeper"] },
      code: `export default defineEventHandler(async (event) => {
  await gatekeeper(event);
  return loadStats();
});
`,
    },
    {
      name: "session set on the event by a server middleware",
      filename: "server/api/notes.post.ts",
      code: `export default defineEventHandler(async (event) => {
  if (!event.context.user) throw createError({ statusCode: 401 });
  return addNote(event.context.user.id);
});
`,
    },
  ],
  invalid: [
    {
      name: "admin route without any auth check",
      filename: "server/api/admin/metrics.ts",
      code: `export default defineEventHandler(() => {
  return { users: 100 };
});
`,
    },
    {
      name: "mutating POST route without auth check",
      filename: "server/api/settings.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return saveSettings(body);
});
`,
    },
    {
      name: "mutating DELETE route without auth check",
      filename: "server/api/account.delete.ts",
      code: `export default defineEventHandler((event) => {
  return deleteAccount();
});
`,
    },
    {
      name: "a userId member name is not an auth check",
      filename: "server/api/admin/premium/index.post.ts",
      code: `export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return createPlan({ ownerId: body.userId, token: body.token });
});
`,
    },
    {
      name: "admin route calling a non-guard helper",
      filename: "server/api/admin/tco/index.post.ts",
      options: { authFunctions: ["ensureAdmin"] },
      code: `export default defineEventHandler(async (event) => {
  await loadPlans(event);
  return { ok: true };
});
`,
    },
  ],
};

export default cases;
