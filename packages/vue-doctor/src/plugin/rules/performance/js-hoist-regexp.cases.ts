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
    {
      name: "pattern built from the loop variable",
      filename: "server/utils/seoScore.ts",
      code: `export function countKeywordOccurrences(text: string, phrases: string[]): number {\n  let total = 0;\n  for (const phrase of phrases) {\n    const escaped = escapeRegExp(phrase);\n    const regex = new RegExp(escaped, "gi");\n    total += text.match(regex)?.length ?? 0;\n  }\n  return total;\n}\n`,
    },
    {
      name: "pattern concatenated with the loop counter",
      code: `export const run = (n) => { for (let i = 0; i < n; i++) { new RegExp("x" + i); } };\n`,
    },
    {
      name: "pattern read from an object that may change between iterations",
      code: `export const run = (state) => { while (state.next()) { const re = new RegExp(state.pattern); re.test(state.value); } };\n`,
    },
  ],
  invalid: [
    {
      name: "new RegExp with a literal pattern in a for-of loop",
      code: `export const check = (lines) => { for (const line of lines) { new RegExp("^a+$").test(line); } };\n`,
    },
    {
      name: "pattern from a parameter that does not change in the loop",
      code: `export const count = (lines, term) => { let n = 0; for (const line of lines) { if (new RegExp(term, "i").test(line)) n++; } return n; };\n`,
    },
    {
      name: "template literal pattern with only invariant parts in a while loop",
      code: `const PREFIX = "id-";\nexport const run = (queue) => { while (queue.length) { const re = new RegExp(\`^\${PREFIX}\\\\d+$\`); re.test(queue.pop()); } };\n`,
    },
  ],
};

export default cases;
