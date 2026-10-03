import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "small blur",
      code: `export const style = { filter: "blur(4px)" };\n`,
    },
    {
      name: "blur exactly at the threshold",
      code: `export const style = { filter: "blur(10px)" };\n`,
    },
    {
      name: "filter without blur",
      code: `export const style = { filter: "brightness(1.2) contrast(0.9)" };\n`,
    },
    {
      name: "other property carrying a large number",
      code: `export const style = { width: "blur(40px)", opacity: 0.5 };\n`,
    },
    {
      name: "blur in a relative unit is not matched",
      code: `export const style = { filter: "blur(2rem)" };\n`,
    },
  ],
  invalid: [
    {
      name: "large blur radius",
      code: `export const style = { filter: "blur(20px)" };\n`,
    },
    {
      name: "fractional radius above the threshold",
      code: `export const style = { filter: "blur(12.5px)" };\n`,
    },
    {
      name: "blur combined with other filter functions",
      code: `export const style = { filter: "brightness(1.2) blur(40px)" };\n`,
    },
  ],
};

export default cases;
