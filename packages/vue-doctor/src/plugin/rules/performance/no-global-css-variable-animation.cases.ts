import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "reactive style binding instead of the DOM API",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst style = computed(() => ({ "--progress": progress.value }));\n</script>\n`,
    },
    {
      name: "setProperty for a regular CSS property, not a variable",
      code: `export const mark = (el) => el.style.setProperty("color", "red");\n`,
    },
    {
      name: "removing and reading a custom property",
      code: `el.style.removeProperty("--x");\nexport const x = getComputedStyle(el).getPropertyValue("--x");\n`,
    },
    {
      name: "setProperty on a non-CSS object",
      code: `export const copy = (descriptor) => descriptor.setProperty("name", "a");\n`,
    },
  ],
  invalid: [
    {
      name: "custom property set on an element",
      code: `export const move = (el, y) => el.style.setProperty("--scroll-y", y + "px");\n`,
    },
    {
      name: "custom property set on the root element",
      code: `export const theme = (hue) => document.documentElement.style.setProperty("--hue", hue);\n`,
    },
    {
      name: "property name only known at runtime",
      code: `export const apply = (el, name, value) => el.style.setProperty(name, value);\n`,
    },
  ],
};

export default cases;
