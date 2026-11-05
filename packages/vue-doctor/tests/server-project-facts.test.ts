import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeRuleOptions } from "../src/config/rule-options.js";
import { diagnose } from "../src/index.js";
import { collectServerProjectFacts, inferServerRuleOptions } from "../src/utils/server-project-facts.js";

const temporaryDirectories: string[] = [];
const makeProject = (files: Record<string, string>): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-server-facts-"));
  temporaryDirectories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const ADMIN_UTILS = `import { createError } from "h3"
import { serverSupabaseUser } from "#supabase/server"

export const ensureAdmin = async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: "Unauthorized" })
  return user
}

export async function gate(event) {
  const user = await serverSupabaseUser(event)
  if (!user?.app_metadata?.staff) {
    throw createError({ statusCode: 403 })
  }
}

export async function withPermission(event, key) {
  await gate(event)
  return key
}

export const loadProfile = async (event) => {
  const client = await serverSupabaseClient(event)
  return client.from("profiles").select()
}

// export function commentedOut(event) { return getUserSession(event) }
export const formatPrice = (value) => \`€ \${value}\`
`;

describe("collectServerProjectFacts", () => {
  it("infers auth helpers and session readers from server/utils, transitively", () => {
    const facts = collectServerProjectFacts(makeProject({ "server/utils/admin.ts": ADMIN_UTILS }));
    expect(facts.authFunctions).toEqual(["ensureAdmin", "gate", "withPermission"]);
    expect(facts.sessionFunctions).toEqual(["ensureAdmin", "gate", "loadProfile", "withPermission"]);
  });

  it("respects custom serverDir in nuxt.config", () => {
    const facts = collectServerProjectFacts(
      makeProject({
        "nuxt.config.ts": `export default defineNuxtConfig({ serverDir: "custom-server" })\n`,
        "custom-server/utils/admin.ts": ADMIN_UTILS,
      }),
    );
    expect(facts.authFunctions).toEqual(["ensureAdmin", "gate", "withPermission"]);
  });

  it("skips test files and functions that are not exported", () => {
    const facts = collectServerProjectFacts(
      makeProject({
        "server/utils/admin.test.ts": ADMIN_UTILS,
        "server/utils/local.ts": `async function guardian(event) { await requireUserSession(event); throw createError({ statusCode: 401 }) }\n`,
      }),
    );
    expect(facts.authFunctions).toEqual([]);
    expect(facts.sessionFunctions).toEqual([]);
  });

  it("bounds each function by its own body and resolves calls by file and export", () => {
    const facts = collectServerProjectFacts(
      makeProject({
        "server/utils/admin.ts": ADMIN_UTILS,
        "server/utils/time.ts": `export const now = () => Date.now()\n\nexport function stamp(event) {\n  return ensureAdmin(event).then(() => now())\n}\n`,
        "server/utils/clock.ts": `export const tick = () => now()\n`,
        "server/utils/duplicate.ts": `export const gate = () => true\nexport const open = () => gate()\n`,
      }),
    );
    expect(facts.authFunctions).toContain("stamp");
    expect(facts.authFunctions).not.toContain("now");
    expect(facts.authFunctions).not.toContain("tick");
    // `gate` is declared in two files, so a call from a third file is not resolved to the auth one.
    expect(facts.authFunctions).not.toContain("open");
  });

  it.each([
    [`export default defineNuxtConfig({ modules: ["@nuxtjs/supabase"] })`, "lax"],
    [`export default defineNuxtConfig({ modules: ["@nuxtjs/supabase"], supabase: { cookieOptions: { secure: true } } })`, "lax"],
    [`export default defineNuxtConfig({ modules: ["@nuxtjs/supabase"], supabase: { cookieOptions: { sameSite: "none" } } })`, "none"],
    [`export default defineNuxtConfig({ modules: ["nuxt-auth-utils"], runtimeConfig: { session: { cookie: { sameSite: "strict" } } } })`, "strict"],
    [`export default defineNuxtConfig({ modules: ["@pinia/nuxt"] })`, null],
  ])("reads the session cookie's SameSite from %s", (nuxtConfig, expected) => {
    expect(collectServerProjectFacts(makeProject({ "nuxt.config.ts": nuxtConfig })).sessionCookieSameSite).toBe(expected);
  });

  it("detects CSRF modules and same-origin middleware, but not any middleware reading a header", () => {
    const withModule = makeProject({ "nuxt.config.ts": `export default defineNuxtConfig({ modules: ["nuxt-security"] })` });
    const withMiddleware = makeProject({
      "server/middleware/sameOrigin.ts": `export default defineEventHandler((event) => {
  if (event.method === "GET") return
  const site = getRequestHeader(event, "sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") throw createError({ statusCode: 403 })
})
`,
    });
    const withRedirect = makeProject({
      "server/middleware/redirect.ts": `export default defineEventHandler((event) => {
  const referer = getRequestHeader(event, "referer")
  if (!referer) throw createError({ statusCode: 404 })
})
`,
    });
    expect(collectServerProjectFacts(withModule).csrfProtection).toBe(true);
    expect(collectServerProjectFacts(withMiddleware).csrfProtection).toBe(true);
    expect(collectServerProjectFacts(withRedirect).csrfProtection).toBe(false);
  });

  it("turns the facts into rule options and lets configured options win", () => {
    const directory = makeProject({
      "nuxt.config.ts": `export default defineNuxtConfig({ modules: ["@nuxtjs/supabase"] })`,
      "server/utils/admin.ts": ADMIN_UTILS,
    });
    const inferred = inferServerRuleOptions(directory);
    expect(inferred["auth-missing"]).toEqual({ authFunctions: ["ensureAdmin", "gate", "withPermission"] });
    expect(inferred["csrf-on-mutating-routes"]).toMatchObject({ sessionCookieSameSite: "lax" });
    const merged = mergeRuleOptions(inferred, {
      "auth-missing": { authFunctions: ["requireStaff"] },
      "csrf-on-mutating-routes": { sessionCookieSameSite: "none" },
    });
    expect(merged["auth-missing"]).toEqual({ authFunctions: ["ensureAdmin", "gate", "withPermission", "requireStaff"] });
    expect(merged["csrf-on-mutating-routes"]).toMatchObject({ sessionCookieSameSite: "none" });
  });
});

describe("diagnose() with inferred and configured rule options", () => {
  const files = {
    "package.json": JSON.stringify({ name: "facts-app", dependencies: { nuxt: "^4.0.0", vue: "^3.5.0" } }),
    "nuxt.config.ts": `export default defineNuxtConfig({ modules: ["@nuxtjs/supabase"], supabase: { cookieOptions: { sameSite: "none" } } })\n`,
    "server/utils/admin.ts": ADMIN_UTILS,
    "server/api/admin/stats.get.ts": `export default defineEventHandler(async (event) => {\n  await gate(event)\n  return { ok: true }\n})\n`,
    "server/api/admin/plans.post.ts": `export default defineEventHandler(async (event) => {\n  await gate(event)\n  return savePlan(checkedBody(await readBody(event)))\n})\n`,
  };
  const rulesOf = (result: Awaited<ReturnType<typeof diagnose>>, file: string): string[] =>
    result.diagnostics.filter((diagnostic) => diagnostic.filePath.endsWith(file)).map((diagnostic) => diagnostic.rule);

  it("passes server/utils guards to auth-missing, the SameSite to csrf, and config options to their rules", async () => {
    const directory = makeProject(files);
    const result = await diagnose(directory, {
      cache: false,
      deadCode: false,
      projectChecks: false,
      config: { rules: { "vue-doctor/server/require-input-validation": ["warn", { validators: ["checkedBody"] }] } },
    });
    expect(rulesOf(result, "stats.get.ts")).not.toContain("server/auth-missing");
    expect(rulesOf(result, "plans.post.ts")).not.toContain("server/auth-missing");
    expect(rulesOf(result, "plans.post.ts")).not.toContain("server/require-input-validation");
    // `gate` reads the Supabase session and the cookie is SameSite=None.
    expect(rulesOf(result, "plans.post.ts")).toContain("server/csrf-on-mutating-routes");
  }, 60_000);

  it("re-lints when a server/utils guard changes, even with the cache on", async () => {
    const directory = makeProject(files);
    const first = await diagnose(directory, { deadCode: false, projectChecks: false });
    expect(rulesOf(first, "stats.get.ts")).not.toContain("server/auth-missing");
    fs.writeFileSync(path.join(directory, "server/utils/admin.ts"), "export const formatPrice = (value) => value\n");
    const second = await diagnose(directory, { deadCode: false, projectChecks: false });
    expect(rulesOf(second, "stats.get.ts")).toContain("server/auth-missing");
  }, 60_000);
});
