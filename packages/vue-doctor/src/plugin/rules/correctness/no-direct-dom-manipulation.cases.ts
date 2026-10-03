import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "template ref instead of document lookup",
      filename: "src/Comp.vue",
      code: `<script setup>\nimport { ref, onMounted } from "vue";\nconst input = ref(null);\nonMounted(() => input.value.focus());\n</script>\n`,
    },
    {
      name: "query scoped to an element, not the document",
      code: `export const firstCell = (table) => table.querySelector("td");\n`,
    },
    {
      name: "document property access and event subscription",
      code: `document.title = "Dashboard";\ndocument.addEventListener("visibilitychange", () => {}, { passive: true });\n`,
    },
    {
      name: "method with a similar name on another object",
      code: `export const el = registry.getElementById("a");\n`,
    },
  ],
  invalid: [
    {
      name: "getElementById",
      code: `export const el = document.getElementById("app");\n`,
    },
    {
      name: "querySelector",
      code: `export const el = document.querySelector(".modal");\n`,
    },
    {
      name: "createElement",
      code: `export const div = document.createElement("div");\n`,
    },
  ],
};

export default cases;
