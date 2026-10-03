import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "NuxtImg component",
      code: `export const image = () => h(NuxtImg, { src: "/a.png" });\n`,
    },
    {
      name: "resolved NuxtImg component",
      code: `export const image = () => h(resolveComponent("NuxtImg"), { src: "/a.png" });\n`,
    },
    {
      name: "other media element",
      code: `export const video = () => h("video", { src: "/a.mp4" });\n`,
    },
    {
      name: "element name only contains img",
      code: `export const el = () => h("imgmap");\n`,
    },
  ],
  invalid: [
    {
      name: "img with src",
      code: `export const image = () => h("img", { src: "/a.png", alt: "A" });\n`,
    },
    {
      name: "img without props",
      code: `export const image = () => h("img");\n`,
    },
    {
      name: "img inside a render function",
      code: `export default { render() { return h("figure", [h("img", { src: "/b.png" })]); } };\n`,
    },
  ],
};

export default cases;
