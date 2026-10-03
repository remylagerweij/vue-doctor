import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "Math.min and Math.max",
      code: `export const lowest = Math.min(...values);\nexport const highest = Math.max(...values);\n`,
    },
    {
      name: "sorted result stored and used for ranking",
      code: `const ranked = [...scores].sort((a, b) => b - a);\nexport const podium = ranked.slice(0, 3);\n`,
    },
    {
      name: "plain first element without sorting",
      code: `export const first = items[0];\nexport const last = items[items.length - 1];\n`,
    },
    {
      name: "third smallest value needs a sort",
      code: `export const third = values.sort((a, b) => a - b)[2];\n`,
    },
  ],
  invalid: [
    {
      name: "sort()[0] for the minimum",
      code: `export const lowest = values.sort((a, b) => a - b)[0];\n`,
    },
    {
      name: "sort()[length - 1] for the maximum",
      code: `export const highest = values.sort((a, b) => a - b)[values.length - 1];\n`,
    },
    {
      name: "copy then sort and take the first",
      code: `export const lowest = [...values].sort()[0];\n`,
    },
  ],
};

export default cases;
