import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "compositor-only properties",
      code: `export const style = { transition: "opacity 0.3s ease, transform 0.3s ease" };\n`,
    },
    {
      name: "colour transition",
      code: `export const style = { transition: "background-color 0.2s" };\n`,
    },
    {
      name: "keyframe name that merely contains a layout word",
      code: `export const style = { animation: "bright-pulse 1s infinite" };\n`,
    },
    {
      name: "layout property set without animation",
      code: `export const style = { width: "100px", transition: "none" };\n`,
    },
    {
      name: "transition on filter",
      code: `export const style = { transition: "filter 0.2s, brightness 0.2s" };\n`,
    },
  ],
  invalid: [
    {
      name: "transition of width",
      code: `export const style = { transition: "width 0.3s ease" };\n`,
    },
    {
      name: "layout property mixed with compositor ones",
      code: `export const style = { transition: "opacity 0.3s, height 0.3s" };\n`,
    },
    {
      name: "kebab-case multi-word property",
      code: `export const style = { transition: "padding-top 0.3s" };\n`,
    },
    {
      name: "max-height collapse animation",
      code: `export const style = { transition: "max-height 0.5s ease-out" };\n`,
    },
  ],
};

export default cases;
