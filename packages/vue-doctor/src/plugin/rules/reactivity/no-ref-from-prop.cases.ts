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
    {
      name: "initial* prop is a seed (AuthModal.vue initialView)",
      filename: "src/AuthModal.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ initialView?: "login" | "register" }>();\nconst view = ref(props.initialView ?? "login");\nconst current = ref(props.initialView);\n</script>\n`,
    },
    {
      name: "default* prop is a seed",
      filename: "src/Tabs.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ defaultTab: string }>();\nconst tab = ref(props.defaultTab);\n</script>\n`,
    },
    {
      name: "copy re-synced by a watch on the prop (ProfileMfaSection.vue)",
      filename: "src/ProfileMfaSection.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ isEnrolled: boolean }>();\nconst enrolledState = ref(props.isEnrolled);\nwatch(() => props.isEnrolled, (value) => {\n  enrolledState.value = value;\n});\n</script>\n`,
    },
    {
      name: "editable draft bound with v-model (ProfileNameSection.vue)",
      filename: "src/ProfileNameSection.vue",
      code: `<template>\n  <input v-model="draftName" />\n</template>\n<script setup lang="ts">\nconst props = defineProps<{ displayName: string }>();\nconst draftName = ref(props.displayName);\n</script>\n`,
    },
    {
      name: "copy that the component updates while animating (StaggeredHeading.vue)",
      filename: "src/StaggeredHeading.vue",
      code: `<script setup lang="ts">\nconst props = defineProps<{ text: string }>();\nconst displayedText = ref(props.text);\nconst swap = (next: string) => {\n  displayedText.value = next;\n};\n</script>\n`,
    },
    {
      name: "destructured initial* prop",
      filename: "src/Gallery.vue",
      code: `<script setup lang="ts">\nconst { initialIndex = 0 } = defineProps<{ initialIndex?: number }>();\nconst index = ref(initialIndex);\n</script>\n`,
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
    {
      name: "destructured prop copied into a ref",
      filename: "src/Price.vue",
      code: `<template>\n  <span>{{ price }}</span>\n</template>\n<script setup lang="ts">\nconst { amount } = defineProps<{ amount: number }>();\nconst price = ref(amount);\n</script>\n`,
    },
    {
      name: "withDefaults props object under another name",
      filename: "src/Badge.vue",
      code: `<script setup lang="ts">\nconst p = withDefaults(defineProps<{ tone?: string }>(), { tone: "neutral" });\nconst tone = ref(p.tone);\n</script>\n`,
    },
  ],
};

export default cases;
