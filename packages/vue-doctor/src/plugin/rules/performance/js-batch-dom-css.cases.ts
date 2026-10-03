import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "single style assignment",
      code: `export const hide = (el) => { el.style.display = "none"; };\n`,
    },
    {
      name: "style assignments separated by another statement",
      code: `export const place = (el) => {\n  el.style.top = "1px";\n  log("placing");\n  el.style.left = "2px";\n};\n`,
    },
    {
      name: "batched through cssText",
      code: `export const place = (el) => { el.style.cssText = "top: 1px; left: 2px;"; };\n`,
    },
    {
      name: "sequential assignments to non-style properties",
      code: `export const label = (el) => {\n  el.dataset.a = "1";\n  el.dataset.b = "2";\n};\n`,
    },
  ],
  invalid: [
    {
      name: "two style assignments in a row",
      code: `export const place = (el) => {\n  el.style.top = "1px";\n  el.style.left = "2px";\n};\n`,
    },
    {
      name: "three in a row report each adjacent pair",
      count: 2,
      code: `export const resize = (el) => {\n  el.style.width = "10px";\n  el.style.height = "10px";\n  el.style.margin = "0";\n};\n`,
    },
    {
      name: "refs in script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nfunction move(box) {\n  box.value.style.transform = "none";\n  box.value.style.opacity = "1";\n}\n</script>\n`,
    },
  ],
};

export default cases;
