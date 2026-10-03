import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "useFetch on the server",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst { data } = await useFetch("/api/users");\n</script>\n`,
    },
    {
      name: "onMounted without a request",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(() => { chart.value.resize(); });\n</script>\n`,
    },
    {
      name: "onMounted that only awaits nextTick",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(async () => { await nextTick(); focus(); });\n</script>\n`,
    },
    {
      name: "fetch triggered by a user action",
      filename: "src/Comp.vue",
      code: `<script setup>\nasync function refresh() { await $fetch("/api/users"); }\n</script>\n`,
    },
    {
      name: "write request through another client",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(async () => { await analytics.track("view"); });\n</script>\n`,
    },
  ],
  invalid: [
    {
      name: "fetch awaited in onMounted",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(async () => { await fetch("/api/users"); });\n</script>\n`,
    },
    {
      name: "$fetch awaited in onBeforeMount",
      filename: "src/Comp.vue",
      code: `<script setup>\nonBeforeMount(async () => { await $fetch("/api/users"); });\n</script>\n`,
    },
    {
      name: "function expression callback",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(async function () { await fetch("/api/posts"); });\n</script>\n`,
    },
  ],
};

export default cases;
