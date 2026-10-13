import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "shallow watch on a specific property",
      code: `watch(() => props.user.id, () => reload());\n`,
    },
    {
      name: "options without deep",
      code: `watch(query, () => search(), { immediate: true });\n`,
    },
    {
      name: "deep explicitly disabled",
      code: `watch(state, () => save(), { deep: false });\n`,
    },
    {
      name: "numeric depth limit (Vue 3.5) is not a full traversal",
      code: `watch(state, () => save(), { deep: 1 });\n`,
    },
    {
      name: "watchEffect has no deep option",
      code: `watchEffect(() => { document.title = title.value; });\n`,
    },
    {
      name: "getter returning an object of plain prop reads",
      filename: "src/BasePriceChart.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ smoothing?: boolean; showArea?: boolean; yPadding?: number }>();\nwatch(\n  () => ({ smoothing: props.smoothing, showArea: props.showArea, yPadding: props.yPadding }),\n  () => redraw(),\n  { deep: true },\n);\n</script>\n`,
    },
    {
      name: "primitive prop declared in a local interface",
      filename: "src/BackgroundGradient.vue",
      code: `<script setup lang="ts">\ninterface Props {\n  variant?: "default" | "warm" | "cool";\n}\nconst props = withDefaults(defineProps<Props>(), { variant: "default" });\nwatch(() => props.variant, () => restart(), { deep: true });\n</script>\n`,
    },
    {
      name: "primitive runtime prop",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst props = defineProps({ mode: { type: String, default: "list" } });\nwatch(() => props.mode, () => reset(), { deep: true });\n</script>\n`,
    },
    {
      name: "ref holding a primitive",
      code: `const page = ref(1);\nwatch(page, () => load(), { deep: true });\n`,
    },
  ],
  invalid: [
    {
      name: "deep: true on a reactive object",
      code: `watch(form, () => save(), { deep: true });\n`,
    },
    {
      name: "deep together with immediate",
      code: `watch(() => props.config, () => apply(), { immediate: true, deep: true });\n`,
    },
    {
      name: "inside script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nwatch(items, (next) => sync(next), { deep: true });\n</script>\n`,
    },
    {
      name: "large price-point array prop",
      filename: "src/AdminRevenueChart.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ data: RevenuePoint[] }>();\nwatch(() => props.data, drawChart, { deep: true });\n</script>\n`,
    },
    {
      name: "getter literal that includes an array prop",
      filename: "src/DealerMap.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ dealer?: Dealer; dealers?: Dealer[]; zoom?: number }>();\nwatch(() => [props.dealer, props.dealers, props.zoom], () => initMap(), { deep: true });\n</script>\n`,
    },
    {
      name: "getter that builds a copy of a reactive object",
      code: `watch(() => ({ ...state }), (value) => mirror(value), { deep: true });\n`,
    },
  ],
};

export default cases;
