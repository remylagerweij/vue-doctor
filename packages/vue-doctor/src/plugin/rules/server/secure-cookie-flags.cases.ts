import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "auth token cookie with full security flags",
      filename: "server/api/login.post.ts",
      code: `export default defineEventHandler((event) => {
  setCookie(event, "auth_token", "xyz", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });
});
`,
    },
    {
      name: "theme preference cookie without security flags (non-sensitive)",
      filename: "server/api/theme.ts",
      code: `export default defineEventHandler((event) => {
  setCookie(event, "theme", "dark");
});
`,
    },
    {
      name: "session cookie with strict sameSite and flags",
      filename: "server/api/session.ts",
      code: `export default defineEventHandler((event) => {
  setCookie(event, "sessionId", "abc", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
});
`,
    },
    {
      name: "client-side call (rule only applies in server files)",
      filename: "src/utils/cookie.ts",
      code: `export const save = (name, val) => {
  setCookie(event, "token", val);
};
`,
    },
  ],
  invalid: [
    {
      name: "session cookie with no options",
      filename: "server/api/login.ts",
      code: `export default defineEventHandler((event) => {
  setCookie(event, "session", "123");
});
`,
    },
    {
      name: "auth token missing httpOnly",
      filename: "server/api/auth.ts",
      code: `export default defineEventHandler((event) => {
  setCookie(event, "auth_token", "xyz", {
    secure: true,
    sameSite: "lax",
  });
});
`,
    },
    {
      name: "jwt cookie with httpOnly false",
      filename: "server/api/token.ts",
      code: `export default defineEventHandler((event) => {
  setCookie(event, "jwt_token", "jwt", {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
  });
});
`,
    },
    {
      name: "sid cookie missing sameSite and secure",
      filename: "server/api/login.ts",
      code: `export default defineEventHandler((event) => {
  setCookie(event, "sid", "sess", {
    httpOnly: true,
  });
});
`,
    },
  ],
};

export default cases;
