import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "external script with defer",
      code: `useHead({ script: [{ src: "https://cdn.example.com/widget.js", defer: true }] });\n`,
    },
    {
      name: "external script with async",
      code: `useHead({ script: [{ src: "https://cdn.example.com/analytics.js", async: true }] });\n`,
    },
    {
      name: "inline script without src",
      code: `useHead({ script: [{ innerHTML: "window.dataLayer = []" }] });\n`,
    },
    {
      name: "useHead without scripts",
      code: `useHead({ title: "Dashboard", link: [{ rel: "icon", href: "/favicon.ico" }] });\n`,
    },
  ],
  invalid: [
    {
      name: "blocking third-party script",
      code: `useHead({ script: [{ src: "https://cdn.example.com/widget.js" }] });\n`,
    },
    {
      name: "only the undeferred script of several is reported",
      code: `useHead({
  script: [
    { src: "https://cdn.example.com/a.js", defer: true },
    { src: "https://cdn.example.com/b.js" },
  ],
});
`,
    },
    {
      name: "inside a script setup block",
      filename: "src/pages/index.vue",
      code: `<script setup>
useHead({ title: "Home", script: [{ src: "https://cdn.example.com/chat.js", type: "text/javascript" }] });
</script>
`,
    },
  ],
};

export default cases;
