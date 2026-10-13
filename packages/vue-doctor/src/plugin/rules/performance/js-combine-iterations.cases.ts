import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "chained iterations in a test assertion",
      filename: "src/utils/prices.test.ts",
      code: `expect(rows.filter((row) => row.sold).map((row) => row.price)).toEqual([100]);\n`,
    },
    {
      name: "single pass with reduce",
      code: `export const names = users.reduce((out, user) => (user.active ? [...out, user.name] : out), []);\n`,
    },
    {
      name: "map followed by join",
      code: `export const label = users.map((user) => user.name).join(", ");\n`,
    },
    {
      name: "filter followed by a terminal find",
      code: `export const admin = users.filter((user) => user.active).find((user) => user.admin);\n`,
    },
    {
      name: "sort followed by map",
      code: `export const names = users.sort(byName).map((user) => user.name);\n`,
    },
    {
      name: "a single two-step chain outside any loop",
      code: `export const names = users.filter((user) => user.active).map((user) => user.name);\n`,
    },
    {
      name: "trimming a small array literal of recipients",
      code: `export const recipients = [to, cc, bcc].map((address) => address?.trim()).filter(Boolean);\n`,
    },
    {
      name: "map then filter(Boolean) inside a loop only compacts",
      code: `export const run = (groups) => { for (const group of groups) { send(group.items.map(toId).filter(Boolean)); } };\n`,
    },
    {
      name: "map then a type-guard filter keeps the narrowed type",
      code: `export const ids = (rows: Row[]) => rows.map((row) => row.organizationId).filter((id): id is number => typeof id === "number");\n`,
    },
    {
      name: "chain in a for-of head runs once",
      code: `export const run = (rows) => { for (const id of rows.filter(isActive).map(toId)) use(id); };\n`,
    },
    {
      name: "chain inside a computed getter is not a loop",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst visible = computed(() => lineStyles.value.filter((style) => style.visible).map((style) => style.key));\n</script>\n`,
    },
  ],
  invalid: [
    {
      name: "three iteration methods in one chain",
      code: `export const names = users.filter((user) => user.active).map((user) => user.profile).filter((profile) => profile.public);\n`,
    },
    {
      name: "map, filter(Boolean) and another map",
      code: `export const names = rows.filter(isVisible).map(toLabel).filter(Boolean).map((label) => label.trim());\n`,
    },
    {
      name: "filter then map inside a for-of loop",
      code: `export const run = (groups) => { for (const group of groups) { send(group.items.filter((item) => item.active).map((item) => item.id)); } };\n`,
    },
    {
      name: "map then filter inside a map callback",
      code: `export const grid = rows.map((row) => row.cells.map((cell) => cell.value).filter((value) => value > 0));\n`,
    },
    {
      name: "map then forEach inside a while loop",
      code: `export const drain = (queue) => { while (queue.length) { queue.pop().map((row) => normalize(row)).forEach((row) => render(row)); } };\n`,
    },
    {
      name: "long chain in script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst tags = computed(() => posts.value.flatMap((post) => post.tags).filter((tag) => tag.length).map((tag) => tag.toLowerCase()));\n</script>\n`,
    },
  ],
};

export default cases;
