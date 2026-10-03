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
  ],
};

export default cases;
