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
  ],
};

export default cases;
