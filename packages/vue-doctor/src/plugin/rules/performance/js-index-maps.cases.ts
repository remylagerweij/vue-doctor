import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "single find outside a loop",
      code: `export const admin = users.find((user) => user.admin);\n`,
    },
    {
      name: "lookups through a prebuilt Map",
      code: `const byId = new Map(users.map((user) => [user.id, user]));\nexport const names = (ids) => { const out = []; for (const id of ids) out.push(byId.get(id)?.name); return out; };\n`,
    },
    {
      name: "other array methods inside a loop",
      code: `export const run = (groups) => { for (const group of groups) { group.items.filter(Boolean); } };\n`,
    },
    {
      name: "find defined in a helper called outside a loop",
      code: `const findUser = (id) => users.find((user) => user.id === id);\nexport const current = findUser(1);\n`,
    },
    {
      name: "flag predicate rather than a key comparison",
      filename: "src/AppNavSections.vue",
      code: `<script setup>\nfunction activeLink() {\n  for (const area of props.areas) {\n    const item = links.find((link) => link.active);\n    if (item) return item;\n  }\n}\n</script>\n`,
    },
    {
      name: "receiver is the loop variable, so each array is searched once",
      filename: "src/TasteAdvisor.vue",
      code: `<script setup>\nconst merged = computed(() => {\n  for (const question of QUESTIONS) {\n    const choiceId = selections.value[question.id];\n    const choice = question.choices.find((c) => c.id === choiceId);\n    if (choice) use(choice);\n  }\n});\n</script>\n`,
    },
    {
      name: "receiver is fetched inside the paging loop",
      code: `export async function findUserId(registry, email) {\n  for (let page = 1; page <= 10; page += 1) {\n    const { data } = await registry.listUsers({ page });\n    const match = data.users.find((user) => user.email === email);\n    if (match) return match.id;\n  }\n  return null;\n}\n`,
    },
    {
      name: "find on a Map-like object is not an array search",
      code: `const index = new Registry();\nexport const run = (ids) => { for (const id of ids) index.find((entry) => entry.id === id); };\n`,
    },
  ],
  invalid: [
    {
      name: "find inside a for-of loop",
      code: `export const names = (ids) => { const out = []; for (const id of ids) { out.push(users.find((user) => user.id === id)); } return out; };\n`,
    },
    {
      name: "findIndex inside a while loop",
      code: `export const run = (queue) => { while (queue.length) { const at = list.findIndex((item) => item === queue.pop()); log(at); } };\n`,
    },
    {
      name: "find inside a classic for loop",
      code: `export const run = (ids) => { for (let i = 0; i < ids.length; i++) { rows.find((row) => row.id === ids[i]); } };\n`,
    },
    {
      name: "find on a prop array inside a loop over another list",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst rows = computed(() => {\n  const out = [];\n  for (const order of props.orders) {\n    out.push({ order, customer: props.customers.find((customer) => customer.id === order.customerId) });\n  }\n  return out;\n});\n</script>\n`,
    },
    {
      name: "loop-invariant parameter searched on every attempt",
      code: `export const next = (candidates: Candidate[], start: number) => {\n  for (let attempt = 0; attempt < 1000; attempt += 1) {\n    const winner = candidates.find((item) => item.originalIndex === pick(attempt));\n    if (winner) return winner;\n  }\n  return null;\n};\n`,
    },
  ],
};

export default cases;
