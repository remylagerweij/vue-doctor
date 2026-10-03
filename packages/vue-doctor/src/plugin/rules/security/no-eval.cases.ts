import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "function whose name only contains eval",
      code: `export const result = evaluate("1 + 1");\nexport const other = evalMath(2);\n`,
    },
    {
      name: "eval method on a non-global object",
      code: `export const mode = model.eval();\n`,
    },
    {
      name: "string and property named eval",
      code: `export const names = ["eval", "exec"];\nexport const key = { eval: true }.eval;\n`,
    },
    {
      name: "safe expression parser",
      code: `import { parse } from "expr-eval";\nexport const value = parse("2 * 3").evaluate();\n`,
    },
  ],
  invalid: [
    {
      name: "direct eval",
      code: `export const result = eval("1 + 1");\n`,
    },
    {
      name: "window.eval",
      code: `export const result = window.eval(code);\n`,
    },
    {
      name: "globalThis.eval",
      code: `export const result = globalThis.eval(userInput);\n`,
    },
  ],
};

export default cases;
