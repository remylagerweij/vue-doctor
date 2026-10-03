import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "enter from a slightly smaller scale",
      code: `export const initial = { transform: "scale(0.95)", opacity: 0 };\n`,
    },
    {
      name: "scale of one",
      code: `export const final = { scale: 1 };\n`,
    },
    {
      name: "translate to zero is not a scale",
      code: `export const final = { transform: "translateX(0)" };\n`,
    },
    {
      name: "opacity from zero is fine",
      code: `export const initial = { opacity: 0 };\n`,
    },
  ],
  invalid: [
    {
      name: "scale(0) transform",
      code: `export const initial = { transform: "scale(0)" };\n`,
    },
    {
      name: "numeric scale of zero",
      code: `export const initial = { scale: 0, opacity: 0 };\n`,
    },
    {
      name: "in a Motion-style variants object",
      code: `export const variants = { hidden: { scale: 0 }, visible: { scale: 1 } };\n`,
    },
  ],
};

export default cases;
