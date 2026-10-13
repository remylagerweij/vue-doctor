import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "already parallel with Promise.all",
      code: `export async function load() {\n  const [users, posts, tags] = await Promise.all([fetchUsers(), fetchPosts(), fetchTags()]);\n  return { users, posts, tags };\n}\n`,
    },
    {
      name: "each await depends on the previous result",
      code: `export async function load(id) {\n  const user = await fetchUser(id);\n  const team = await fetchTeam(user.teamId);\n  const members = await fetchMembers(team.id);\n  return members;\n}\n`,
    },
    {
      name: "only two sequential awaits",
      code: `export async function load() {\n  const a = await fetchA();\n  const b = await fetchB();\n  return [a, b];\n}\n`,
    },
    {
      name: "awaits separated by other statements",
      code: `export async function load() {\n  const a = await fetchA();\n  log(a);\n  const b = await fetchB();\n  log(b);\n  const c = await fetchC();\n  return c;\n}\n`,
    },
    {
      name: "sequential awaits in a test file are intentional",
      filename: "src/load.test.ts",
      code: `it("works", async () => {\n  await first();\n  await second();\n  await third();\n});\n`,
    },
    {
      name: "destructured binding used by the next await",
      filename: "server/api/roles/index.get.ts",
      code: `export default defineEventHandler(async (event) => {\n  const { organizationId, userId, client } = await loadOrganizationContext(event);\n  const { data: roles } = await client.from("roles").select("*").eq("organization_id", organizationId);\n  const { data: members } = await client.from("members").select("*").eq("user_id", userId);\n  return { roles, members };\n});\n`,
    },
    {
      name: "admin guard runs before the work it protects",
      filename: "server/api/admin/premium/index.post.ts",
      code: `export default defineEventHandler(async (event) => {\n  await ensureAdmin(event);\n  const client = await serverSupabaseClient(event);\n  const body = await parseBody(event, PlanSchema);\n  return client.from("plans").insert(body);\n});\n`,
    },
    {
      name: "rate limit before an account deletion",
      filename: "server/api/user/account.delete.ts",
      code: `export default defineEventHandler(async (event) => {\n  await enforceRateLimit(event, { key: "account-delete", limit: 3 });\n  await deleteUserData(userId);\n  const { error } = await serviceRole.auth.admin.deleteUser(userId);\n  return { ok: !error };\n});\n`,
    },
    {
      name: "a bound guard result still gates cheap request accessors",
      filename: "server/api/admin/mailing/send.post.ts",
      code: `export default defineEventHandler(async (event) => {\n  const admin = await ensureAdmin(event);\n  const client = await serverSupabaseClient(event);\n  const serviceRole = await serverSupabaseServiceRole(event);\n  const body = await readBody(event);\n  return send(admin, client, serviceRole, body);\n});\n`,
    },
    {
      name: "write, read and remove of the same cache key",
      code: `export async function probe(storage, key, payload) {\n  await storage.setItem(key, payload);\n  const stored = await storage.getItem(key);\n  await storage.removeItem(key);\n  return stored;\n}\n`,
    },
    {
      name: "parent rows are inserted before child rows",
      code: `export async function restore(backup) {\n  await batchInsert("motorcycles", backup.motorcycles);\n  await batchInsert("intervals", backup.intervals);\n  await batchInsert("parts", backup.parts);\n}\n`,
    },
    {
      name: "an expression-statement await consumes the earlier result",
      code: `export async function rename(id, name) {\n  const existing = await loadRole(id);\n  const renamed = await renameRole(existing, name);\n  await logAudit(renamed);\n  return renamed;\n}\n`,
    },
  ],
  invalid: [
    {
      name: "three independent fetches",
      code: `export async function load() {\n  const users = await fetchUsers();\n  const posts = await fetchPosts();\n  const tags = await fetchTags();\n  return { users, posts, tags };\n}\n`,
    },
    {
      name: "independent expression-statement awaits",
      code: `export async function init() {\n  await loadConfig();\n  await warmCache();\n  await connectSocket();\n}\n`,
    },
    {
      name: "inside an async script setup handler",
      filename: "src/Comp.vue",
      code: `<script setup>\nasync function refresh() {\n  const a = await getA();\n  const b = await getB();\n  const c = await getC();\n  const d = await getD();\n}\n</script>\n`,
    },
    {
      name: "independent counts after an if statement",
      filename: "server/api/admin/stats.get.ts",
      code: `export default defineEventHandler(async () => {\n  const activeAds = await getMotorcycleCount();\n  const dealers = await prisma.organizations.count();\n  const brands = await prisma.manufacturers.count();\n  const models = await prisma.models.count();\n  return { activeAds, dealers, brands, models };\n});\n`,
    },
    {
      name: "independent destructured selects",
      filename: "server/api/admin/users/timeline.get.ts",
      code: `export default defineEventHandler(async () => {\n  const { data: logs } = await client.from("activity").select("*").eq("user_id", userId);\n  const { data: subscriptions } = await client.from("subscriptions").select("*").eq("user_id", userId);\n  const { data: likes } = await client.from("likes").select("*").eq("user_id", userId);\n  return { logs, subscriptions, likes };\n});\n`,
    },
    {
      name: "independent work after the guard is still reported",
      filename: "server/api/admin/users/index.get.ts",
      code: `export default defineEventHandler(async (event) => {\n  await ensureAdmin(event);\n  const { data: settings } = await client.from("settings").select("*").in("id", ids);\n  const { data: subscriptions } = await client.from("subscriptions").select("*").in("user_id", ids);\n  const adminClient = await serverSupabaseServiceRole(event);\n  return { settings, subscriptions, adminClient };\n});\n`,
    },
  ],
};

export default cases;
