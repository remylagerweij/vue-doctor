import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "regex hoisted to module level",
      code: `const PATTERN = new RegExp("^a+$");\nexport const check = (lines) => { for (const line of lines) PATTERN.test(line); };\n`,
    },
    {
      name: "regex literal inside a loop is compiled once by the engine",
      code: `export const check = (lines) => { for (const line of lines) /^a+$/.test(line); };\n`,
    },
    {
      name: "dynamic RegExp outside of any loop",
      code: `export const makeMatcher = (term) => new RegExp(term, "i");\n`,
    },
    {
      name: "other constructors in a loop",
      code: `export const dates = (xs) => { const out = []; for (const x of xs) out.push(new Date(x)); return out; };\n`,
    },
  ],
  invalid: [
    {
      name: "new RegExp in a for-of loop",
      code: `export const check = (lines) => { for (const line of lines) { new RegExp("^a+$").test(line); } };\n`,
    },
    {
      name: "new RegExp in a while loop",
      code: `export const run = (state) => { while (state.next()) { const re = new RegExp(state.pattern); re.test(state.value); } };\n`,
    },
    {
      name: "new RegExp in a classic for loop",
      code: `export const run = (n) => { for (let i = 0; i < n; i++) { new RegExp("x" + i); } };\n`,
    },
  ],
};

export default cases;
