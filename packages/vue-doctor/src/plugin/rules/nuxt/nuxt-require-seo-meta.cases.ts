import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "useSeoMeta",
      code: `useSeoMeta({ title: "Home", description: "Welcome" });\n`,
    },
    {
      name: "useHead with title and link only",
      code: `useHead({ title: "Home", link: [{ rel: "icon", href: "/favicon.ico" }] });\n`,
    },
    {
      name: "useHead with html attributes and a script",
      code: `useHead({ htmlAttrs: { lang: "en" }, script: [{ innerHTML: "1" }] });\n`,
    },
    {
      name: "useHead fed by a computed value cannot be analysed",
      code: `useHead(computed(() => ({ meta: [{ name: "a", content: b.value }] })));\n`,
    },
  ],
  invalid: [
    {
      name: "useHead with a meta array",
      code: `useHead({ meta: [{ name: "description", content: "Welcome" }] });\n`,
    },
    {
      name: "meta alongside other keys",
      code: `useHead({ title: "Home", meta: [{ property: "og:title", content: "Home" }] });\n`,
    },
    {
      name: "meta inside script setup",
      filename: "src/pages/index.vue",
      code: `<script setup>\nuseHead({ meta: [{ name: "robots", content: "noindex" }] });\n</script>\n`,
    },
  ],
};

export default cases;
