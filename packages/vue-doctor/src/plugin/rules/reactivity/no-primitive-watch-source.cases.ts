import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "state is a parameter holding refs, shadowing a reactive declared in another function",
      code: `import { reactive, watch } from "vue";\nexport function useCounterState() {\n  const state = reactive({ count: 0 });\n  return { state };\n}\nexport function useCounterSync(state) {\n  watch(state.count, (value) => console.log(value));\n}\n`,
    },
    {
      name: "reactive declared in a sibling function is not in scope",
      code: `import { reactive, watch } from "vue";\nfunction make() {\n  const state = reactive({ count: 0 });\n  return state;\n}\nfunction sync() {\n  watch(state.count, log);\n}\n`,
    },
    {
      name: "getter of a prop",
      filename: "src/components/Counter.vue",
      code: `<script setup lang="ts">\nimport { watch } from "vue";\nconst props = defineProps<{ count: number }>();\nwatch(() => props.count, log);\n</script>\n`,
    },
    {
      name: "the ref itself",
      code: `import { ref, watch } from "vue";\nexport function useCount() {\n  const count = ref(0);\n  watch(count, log);\n}\n`,
    },
    {
      name: "a nested object of a reactive is a reactive proxy",
      code: `import { reactive, watch } from "vue";\nexport function useFilters() {\n  const state = reactive({ filters: { q: "" } });\n  watch(state.filters, apply, { deep: true });\n}\n`,
    },
    {
      name: "an object prop is reactive",
      filename: "src/components/Table.vue",
      code: `<script setup lang="ts">\nimport { watch } from "vue";\nconst props = defineProps<{ options: { page: number } }>();\nwatch(props.options, reload);\n</script>\n`,
    },
    {
      name: "props typed by an imported interface (unknown)",
      filename: "src/components/Pager.vue",
      code: `<script setup lang="ts">\nimport { watch } from "vue";\nimport type { PagerProps } from "./types";\nconst props = defineProps<PagerProps>();\nwatch(props.page, reload);\n</script>\n`,
    },
    {
      name: "ref value read later, in another function",
      code: `import { onMounted, ref, watch } from "vue";\nexport function useEl() {\n  const el = ref(null);\n  onMounted(() => {\n    watch(el.value, observe);\n  });\n}\n`,
    },
    {
      name: "array props declaration (types unknown)",
      code: `import { defineComponent, watch } from "vue";\nexport default defineComponent({\n  props: ["count"],\n  setup(props) {\n    watch(props.count, log);\n  },\n});\n`,
    },
    {
      name: "ref holding an object",
      code: `import { ref, watch } from "vue";\nexport function useForm() {\n  const form = ref({ name: "" });\n  watch(form.value, save);\n}\n`,
    },
    {
      name: "watch imported from another library",
      code: `import { watch } from "chokidar";\nconst state = { dir: "src" };\nwatch(state.dir);\n`,
    },
  ],
  invalid: [
    {
      name: "primitive property of a reactive object",
      code: `import { reactive, watch } from "vue";\nexport function useCounter() {\n  const state = reactive({ count: 0 });\n  watch(state.count, (value) => console.log(value));\n}\n`,
    },
    {
      name: "number prop from type-based defineProps",
      filename: "src/components/Counter.vue",
      code: `<script setup lang="ts">\nimport { watch } from "vue";\nconst props = defineProps<{ count: number; label?: string }>();\nwatch(props.count, log);\n</script>\n`,
    },
    {
      name: "withDefaults over an interface with a literal union",
      filename: "src/components/Toggle.vue",
      code: `<script setup lang="ts">\ninterface Props {\n  mode?: "light" | "dark";\n}\nconst props = withDefaults(defineProps<Props>(), { mode: "light" });\nwatch(props.mode, apply);\n</script>\n`,
    },
    {
      name: "runtime defineProps declaration",
      filename: "src/components/Modal.vue",
      code: `<script setup>\nimport { watch } from "vue";\nconst props = defineProps({ open: { type: Boolean, default: false } });\nwatch(props.open, (open) => (document.body.style.overflow = open ? "hidden" : ""));\n</script>\n`,
    },
    {
      name: "setup(props) with a Boolean prop option",
      code: `import { defineComponent, watch } from "vue";\nexport default defineComponent({\n  props: { visible: Boolean },\n  setup(props) {\n    watch(props.visible, toggle);\n  },\n});\n`,
    },
    {
      name: "value of a primitive ref in the same function",
      code: `import { ref, watch } from "vue";\nexport function usePage() {\n  const page = ref(1);\n  watch(page.value, load);\n}\n`,
    },
    {
      name: "inside an array of sources",
      code: `import { reactive, ref, watch } from "vue";\nexport function useQuery() {\n  const state = reactive({ q: "", page: 1 });\n  const sort = ref("name");\n  watch([state.q, sort], search);\n}\n`,
    },
  ],
};

export default cases;
