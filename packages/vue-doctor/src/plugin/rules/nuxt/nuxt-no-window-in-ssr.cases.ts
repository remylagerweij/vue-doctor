import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "inside onMounted",
      filename: "src/Comp.vue",
      code: `<script setup>\nonMounted(() => { width.value = window.innerWidth; });\n</script>\n`,
    },
    {
      name: "guarded by import.meta.client",
      filename: "src/Comp.vue",
      code: `<script setup>\nif (import.meta.client) { localStorage.setItem("a", "b"); }\n</script>\n`,
    },
    {
      name: "guarded by a typeof window check",
      code: `export const ua = typeof window !== "undefined" ? window.navigator.userAgent : "";\n`,
    },
    {
      name: "early return on the server",
      code: `export function save(value) {\n  if (!import.meta.client) return;\n  localStorage.setItem("v", value);\n}\n`,
    },
    {
      name: "short-circuit with process.client",
      code: `export const width = process.client && window.innerWidth;\n`,
    },
    {
      name: "client-only file is never executed on the server",
      filename: "src/components/Map.client.vue",
      code: `<script setup>\nconst width = window.innerWidth;\n</script>\n`,
    },
    {
      name: "event listener hook runs in the browser only",
      code: `useEventListener(window, "resize", () => { size.value = document.body.clientWidth; });\n`,
    },
    {
      name: "onBeforeMount callback",
      filename: "app/components/Viewport.vue",
      code: `<script setup>\nonBeforeMount(() => { width.value = window.innerWidth; });\n</script>\n`,
    },
    {
      name: "named function called only from onMounted and registered as a listener",
      filename: "app/components/analytics/PriceChart.vue",
      code: `<script setup lang="ts">\nconst windowWidth = ref(1200);\nconst updateWidth = () => {\n  windowWidth.value = window.innerWidth;\n};\nonMounted(() => {\n  updateWidth();\n  window.addEventListener("resize", updateWidth);\n});\nonBeforeUnmount(() => window.removeEventListener("resize", updateWidth));\n</script>\n`,
    },
    {
      name: "function passed by name to onMounted",
      filename: "app/components/Map.vue",
      code: `<script setup>\nfunction init() {\n  map.value = createMap(document.getElementById("map"));\n}\nonMounted(init);\n</script>\n`,
    },
    {
      name: "template event handler",
      filename: "app/components/ApiKeyReveal.vue",
      code: `<template>\n  <button type="button" @click="copy">Copy</button>\n</template>\n<script setup lang="ts">\nconst props = defineProps<{ plaintext: string }>();\nasync function copy() {\n  if (!navigator.clipboard) return;\n  await navigator.clipboard.writeText(props.plaintext);\n}\n</script>\n`,
    },
    {
      name: "inline template handler and a helper it calls",
      filename: "app/components/auth/LoginForm.vue",
      code: `<template>\n  <form @submit.prevent="submit(email)"><input v-model="email" /></form>\n</template>\n<script setup>\nconst email = ref("");\nfunction redirectTarget() {\n  return window.location.href;\n}\nasync function submit(address) {\n  await signIn(address, { redirectTo: redirectTarget() });\n}\n</script>\n`,
    },
    {
      name: "watch callback without immediate does not run during SSR",
      filename: "app/components/layout/HeaderMobileMenu.vue",
      code: `<script setup>\nconst props = defineProps({ open: Boolean });\nfunction toggleScrollLock() {\n  document.documentElement.classList.toggle("overflow-hidden");\n}\nwatch(\n  () => props.open,\n  () => {\n    toggleScrollLock();\n    document.addEventListener("keydown", onKeydown);\n  },\n);\n</script>\n`,
    },
    {
      name: "post-flush watchEffect does not run during SSR",
      filename: "app/components/account/AvatarCropPreview.vue",
      code: `<script setup>\nfunction draw() {\n  const pixels = Math.round(size * (window.devicePixelRatio || 1));\n  paint(pixels);\n}\nwatchEffect(draw, { flush: "post" });\n</script>\n`,
    },
    {
      name: "chain of helpers reached from a scroll listener",
      filename: "app/pages/motoren/[slug].vue",
      code: `<script setup>\nfunction evaluateScrollDepth() {\n  const scrollable = document.documentElement.scrollHeight - window.innerHeight;\n  track(scrollable);\n}\nfunction onScroll() {\n  setTimeout(() => evaluateScrollDepth(), 200);\n}\nonMounted(() => window.addEventListener("scroll", onScroll, { passive: true }));\nonBeforeUnmount(() => window.removeEventListener("scroll", onScroll));\n</script>\n`,
    },
    {
      name: "same-file browser guard helper",
      filename: "app/composables/useEventTracker.ts",
      code: `function isBrowser() {\n  return typeof window !== "undefined" && typeof document !== "undefined";\n}\nexport function readCookie(name) {\n  if (!isBrowser()) return null;\n  return document.cookie.split("; ").find((part) => part.startsWith(name));\n}\n`,
    },
    {
      name: "debounced handler registered in onMounted",
      filename: "app/composables/useViewport.ts",
      code: `export function useViewport() {\n  const width = ref(0);\n  const onResize = useDebounceFn(() => {\n    width.value = window.innerWidth;\n  }, 100);\n  onMounted(() => window.addEventListener("resize", onResize));\n  return { width };\n}\n`,
    },
    {
      name: "browser-run test file",
      filename: "tests/e2e/helpers/scroll.ts",
      code: `export async function scrollToBottom() {\n  window.scrollTo(0, document.body.scrollHeight);\n}\n`,
    },
    {
      name: "component spec",
      filename: "app/components/Modal.spec.ts",
      code: `it("focuses the dialog", () => {\n  expect(document.activeElement).toBe(dialog);\n});\n`,
    },
  ],
  invalid: [
    {
      name: "window at the top level of script setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst width = window.innerWidth;\n</script>\n`,
    },
    {
      name: "localStorage read during setup",
      filename: "src/Comp.vue",
      code: `<script setup>\nconst theme = ref(localStorage.getItem("theme"));\n</script>\n`,
    },
    {
      name: "navigator inside a plain function",
      code: `export function isMobile() {\n  return /Mobi/.test(navigator.userAgent);\n}\n`,
    },
    {
      name: "negated guard does not protect the else-less branch",
      code: `export function read() {\n  if (import.meta.server) {\n    return document.title;\n  }\n}\n`,
    },
    {
      name: "function rendered by the template runs during SSR",
      filename: "app/components/WidthLabel.vue",
      code: `<template>\n  <span>{{ describeWidth() }}</span>\n</template>\n<script setup>\nfunction describeWidth() {\n  return window.innerWidth > 768 ? "wide" : "narrow";\n}\n</script>\n`,
    },
    {
      name: "immediate watch runs its callback during SSR",
      filename: "src/components/GalleryFullscreen.vue",
      code: `<script setup>\nconst props = defineProps({ isOpen: Boolean });\nfunction removeKeydownListener() {\n  window.removeEventListener("keydown", onKeydown);\n}\nwatch(() => props.isOpen, (open) => { if (!open) removeKeydownListener(); }, { immediate: true });\n</script>\n`,
    },
    {
      name: "helper called from onMounted and from setup",
      filename: "app/components/Sizer.vue",
      code: `<script setup>\nconst measure = () => window.innerWidth;\nconst initial = measure();\nonMounted(() => measure());\n</script>\n`,
    },
    {
      name: "nextTick callbacks also run on the server",
      filename: "app/components/Focus.vue",
      code: `<script setup>\nnextTick(() => document.getElementById("search")?.focus());\n</script>\n`,
    },
    {
      name: "function returned from a composable has unknown callers",
      filename: "app/composables/useFocusTrap.ts",
      code: `export function useFocusTrap() {\n  let previous = null;\n  function activate() {\n    previous = document.activeElement;\n  }\n  return { activate };\n}\n`,
    },
  ],
};

export default cases;
