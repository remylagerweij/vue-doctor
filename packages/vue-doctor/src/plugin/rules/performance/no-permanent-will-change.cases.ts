import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "will-change reset to auto",
      code: `export const style = { willChange: "auto" };\n`,
    },
    {
      name: "will-change toggled while animating",
      code: `export const style = (animating) => ({ willChange: animating ? "transform" : "auto" });\n`,
    },
    {
      name: "will-change taken from a variable",
      code: `export const style = (hint) => ({ willChange: hint });\n`,
    },
    {
      name: "unrelated property with the same value",
      code: `export const style = { transitionProperty: "transform" };\n`,
    },
  ],
  invalid: [
    {
      name: "permanent will-change transform",
      code: `export const style = { willChange: "transform" };\n`,
    },
    {
      name: "several properties",
      code: `export const style = { willChange: "opacity, transform" };\n`,
    },
    {
      name: "scroll-position hint",
      code: `export const style = { overflow: "auto", willChange: "scroll-position" };\n`,
    },
  ],
};

export default cases;
