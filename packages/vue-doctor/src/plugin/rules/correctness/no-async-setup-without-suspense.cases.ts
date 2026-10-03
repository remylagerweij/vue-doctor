import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "await inside a lifecycle callback",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(async () => { await load(); });\n</script>\n`,
    },
    {
      name: "await inside an event handler declared in script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nasync function submit() { await save(); }\n</script>\n`,
    },
    {
      name: "await inside a method of an Options API component",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { methods: { async load() { await fetch("/a"); } } };\n</script>\n`,
    },
    {
      name: "await inside a function nested in setup()",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { setup() { const run = async () => { await go(); }; return { run }; } };\n</script>\n`,
    },
    {
      name: "top-level await in a plain TypeScript module",
      filename: "src/util.ts",
      code: `export const config = await loadConfig();\n`,
    },
  ],
  invalid: [
    {
      name: "top-level await in script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst data = await fetch("/api");\n</script>\n`,
    },
    {
      name: "async setup() method",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { async setup() { await load(); } };\n</script>\n`,
    },
    {
      name: "async arrow assigned to setup",
      filename: "src/Comp.vue",
      code: `<script>\nexport default { setup: async () => { await load(); } };\n</script>\n`,
    },
    {
      name: "every await in an async setup is reported",
      filename: "src/Comp.vue",
      count: 2,
      code: `<script>\nexport default { setup: async function () { const a = await one(); const b = await two(); } };\n</script>\n`,
    },
  ],
};

export default cases;
