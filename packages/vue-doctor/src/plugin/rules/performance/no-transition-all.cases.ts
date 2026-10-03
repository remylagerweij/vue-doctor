import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "specific transition properties",
      code: `export const style = { transition: "opacity 0.3s ease, transform 0.3s ease" };\n`,
    },
    {
      name: "transitionProperty with an explicit list",
      code: `export const style = { transitionProperty: "opacity, transform" };\n`,
    },
    {
      name: "keyframe name that merely contains the letters all",
      code: `export const style = { transition: "small-fade 0.3s" };\n`,
    },
    {
      name: "narrow Tailwind transition utilities",
      code: `export const classes = "btn transition-colors duration-200 hover:bg-blue-600";\n`,
    },
  ],
  invalid: [
    {
      name: "transition shorthand with all",
      code: `export const style = { transition: "all 0.3s ease" };\n`,
    },
    {
      name: "transitionProperty all",
      code: `export const style = { transitionProperty: "all" };\n`,
    },
    {
      name: "Tailwind transition-all class",
      code: `export const classes = "btn transition-all duration-200";\n`,
    },
    {
      name: "inline CSS string",
      code: `export const css = "a { transition: all .2s }";\n`,
    },
  ],
};

export default cases;
