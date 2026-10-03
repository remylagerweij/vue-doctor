import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "toRef keeps the link to the prop",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst props = defineProps(["count"]);\nconst count = toRef(props, "count");\n</script>\n`,
    },
    {
      name: "computed derived from the prop",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst props = defineProps(["count"]);\nconst doubled = computed(() => props.count * 2);\n</script>\n`,
    },
    {
      name: "literal initial value",
      code: `export const count = ref(0);\n`,
    },
    {
      name: "member of an object that is not props",
      code: `export const name = ref(user.name);\n`,
    },
    {
      name: "local variable initial value",
      code: `export const useCounter = (initialCount) => ref(initialCount);\n`,
    },
  ],
  invalid: [
    {
      name: "ref copied from a prop",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst props = defineProps(["count"]);\nconst count = ref(props.count);\n</script>\n`,
    },
    {
      name: "list prop copied into a ref",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst props = defineProps(["items"]);\nconst items = ref(props.items);\n</script>\n`,
    },
    {
      name: "inside a composable receiving props",
      code: `export const useForm = (props) => { const model = ref(props.modelValue); return { model }; };\n`,
    },
  ],
};

export default cases;
