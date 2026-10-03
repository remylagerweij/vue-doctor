import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "inside onMounted",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(() => { width.value = window.innerWidth; });\n</script>\n`,
    },
    {
      name: "guarded by import.meta.client",
      filename: "src/Comp.vue",
      code: `<script setup>\nif (import.meta.client) { localStorage.setItem("a", "b"); }\n</script>\n`,
    },
    {
      name: "guarded by a typeof window check",
      code: `export const ua = typeof window !== "undefined" ? window.navigator.userAgent : "";\n`,
    },
    {
      name: "early return on the server",
      code: `export function save(value) {\n  if (!import.meta.client) return;\n  localStorage.setItem("v", value);\n}\n`,
    },
    {
      name: "short-circuit with process.client",
      code: `export const width = process.client && window.innerWidth;\n`,
    },
    {
      name: "client-only file is never executed on the server",
      filename: "src/components/Map.client.vue",
      code: `<script setup>\nconst width = window.innerWidth;\n</script>\n`,
    },
    {
      name: "event listener hook runs in the browser only",
      code: `useEventListener(window, "resize", () => { size.value = document.body.clientWidth; });\n`,
    },
  ],
  invalid: [
    {
      name: "window at the top level of script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst width = window.innerWidth;\n</script>\n`,
    },
    {
      name: "localStorage read during setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst theme = ref(localStorage.getItem("theme"));\n</script>\n`,
    },
    {
      name: "navigator inside a plain function",
      code: `export function isMobile() {\n  return /Mobi/.test(navigator.userAgent);\n}\n`,
    },
    {
      name: "negated guard does not protect the else-less branch",
      code: `export function read() {\n  if (import.meta.server) {\n    return document.title;\n  }\n}\n`,
    },
  ],
};

export default cases;
