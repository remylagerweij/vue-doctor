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
  ],
};

export default cases;
