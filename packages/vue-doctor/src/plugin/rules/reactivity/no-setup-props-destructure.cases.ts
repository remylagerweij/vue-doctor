import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "props read where they are used",
      code: `import { computed, defineComponent } from "vue";\nexport default defineComponent({\n  props: { title: String },\n  setup(props) {\n    const heading = computed(() => props.title?.toUpperCase());\n    return { heading };\n  },\n});\n`,
    },
    {
      name: "the context argument is destructured, not props",
      code: `import { defineComponent } from "vue";\nexport default defineComponent({\n  setup(props, { emit, slots }) {\n    return () => slots.default?.({ emit, props });\n  },\n});\n`,
    },
    {
      name: "toRefs(props) keeps reactivity",
      code: `import { defineComponent, toRefs } from "vue";\nexport default defineComponent({\n  props: { title: String },\n  setup(props) {\n    const { title } = toRefs(props);\n    return { title };\n  },\n});\n`,
    },
    {
      name: "destructuring inside a computed getter re-reads props",
      code: `import { computed, defineComponent } from "vue";\nexport default defineComponent({\n  props: { first: String, last: String },\n  setup(props) {\n    const full = computed(() => {\n      const { first, last } = props;\n      return first + " " + last;\n    });\n    return { full };\n  },\n});\n`,
    },
    {
      name: "esbuild plugin setup() is not a component",
      code: `export const plugin = {\n  name: "aliases",\n  setup({ onResolve }) {\n    onResolve({ filter: /^@/ }, resolveAlias);\n  },\n};\n`,
    },
    {
      name: "defineProps destructure in <script setup> (reactive since Vue 3.5)",
      filename: "src/components/Card.vue",
      code: `<script setup lang="ts">\nconst { title, size = "md" } = defineProps<{ title: string; size?: string }>();\n</script>\n`,
    },
    {
      name: "only seed props are destructured",
      code: `import { defineComponent, ref } from "vue";\nexport default defineComponent({\n  props: { initialCount: Number },\n  setup({ initialCount }) {\n    const count = ref(initialCount ?? 0);\n    return { count };\n  },\n});\n`,
    },
    {
      name: "Vitest-style setup object without component options",
      code: `export default {\n  setup(props) {\n    const { a } = props;\n    return a;\n  },\n};\n`,
    },
  ],
  invalid: [
    {
      name: "props destructured in the setup() parameter",
      code: `import { defineComponent } from "vue";\nexport default defineComponent({\n  props: { title: String },\n  setup({ title }) {\n    return () => title;\n  },\n});\n`,
    },
    {
      name: "props destructured in the setup body",
      code: `import { computed, defineComponent } from "vue";\nexport default defineComponent({\n  props: { title: String, size: String },\n  setup(props) {\n    const { title, size } = props;\n    const classes = computed(() => [size]);\n    return { title, classes };\n  },\n});\n`,
    },
    {
      name: "Options-style .vue component",
      filename: "src/components/Badge.vue",
      code: `<script>\nexport default {\n  props: ["count"],\n  setup({ count }) {\n    return { label: count + " new" };\n  },\n};\n</script>\n`,
    },
    {
      name: "arrow setup with a cast and a nested block",
      code: `import { defineComponent } from "vue";\ntype Props = { mode: string };\nexport default defineComponent({\n  props: { mode: String },\n  setup: (props) => {\n    if (import.meta.env.DEV) {\n      const { mode } = props as Props;\n      console.log(mode);\n    }\n    return {};\n  },\n});\n`,
    },
  ],
};

export default cases;
