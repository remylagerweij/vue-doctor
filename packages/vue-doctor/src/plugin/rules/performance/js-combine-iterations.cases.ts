import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
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
      name: "separate statements on separate arrays",
      code: `export const a = xs.map((x) => x + 1);\nexport const b = ys.filter((y) => y > 1);\n`,
    },
  ],
  invalid: [
    {
      name: "filter then map",
      code: `export const names = users.filter((user) => user.active).map((user) => user.name);\n`,
    },
    {
      name: "map then filter",
      code: `export const positives = values.map((value) => value * 2).filter((value) => value > 0);\n`,
    },
    {
      name: "map then forEach",
      code: `rows.map((row) => normalize(row)).forEach((row) => render(row));\n`,
    },
  ],
};

export default cases;
