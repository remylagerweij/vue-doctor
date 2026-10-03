import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "awaited",
      code: `export async function focus(el) {\n  open.value = true;\n  await nextTick();\n  el.value.focus();\n}\n`,
    },
    {
      name: "callback style",
      code: `nextTick(() => { el.value.focus(); });\n`,
    },
    {
      name: "returned to the caller",
      code: `export const flush = () => nextTick();\nexport function wait() { return nextTick(); }\n`,
    },
    {
      name: "chained with then",
      code: `nextTick().then(() => el.value.focus());\n`,
    },
    {
      name: "stored for later",
      code: `const settled = nextTick();\nexport { settled };\n`,
    },
    {
      name: "this.$nextTick awaited",
      code: `export default { methods: { async focus() { this.open = true; await this.$nextTick(); this.$refs.input.focus(); } } };\n`,
    },
    {
      name: "this.$nextTick with a callback",
      code: `export default { methods: { focus() { this.$nextTick(() => this.$refs.input.focus()); } } };\n`,
    },
  ],
  invalid: [
    {
      name: "bare this.$nextTick (Options API)",
      code: `export default { methods: { focus() { this.open = true; this.$nextTick(); this.$refs.input.focus(); } } };\n`,
    },
    {
      name: "bare nextTick statement",
      code: `export function focus(el) {\n  open.value = true;\n  nextTick();\n  el.value.focus();\n}\n`,
    },
    {
      name: "Vue.nextTick without await",
      code: `export function sync() {\n  Vue.nextTick();\n}\n`,
    },
    {
      name: "inside a script setup handler",
      filename: "src/Comp.vue",
      code: `<script setup>\nfunction open() {\n  visible.value = true;\n  nextTick();\n}\n</script>\n`,
    },
  ],
};

export default cases;
