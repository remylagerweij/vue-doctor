import type { RuleCases } from "../../rule-cases.js";

const sfc = (script: string, lang = ""): string => `<script setup${lang}>\n${script}</script>\n`;

const cases: RuleCases = {
  valid: [
    {
      name: "stopPropagation is a different concern",
      filename: "src/Button.vue",
      code: sfc(`const onClick = (event) => { event.stopPropagation(); };\n`),
    },
    {
      name: "reading defaultPrevented",
      filename: "src/Link.vue",
      code: sfc(`const handled = (event) => event.defaultPrevented;\n`),
    },
    {
      name: "unrelated function named like the method",
      filename: "src/Comp.vue",
      code: sfc(`const preventDefault = () => {};\npreventDefault();\n`),
    },
    {
      name: "template modifier instead of calling the method",
      filename: "src/Form.vue",
      code: `<script setup>\nconst save = () => {};\n</script>\n<template><form @submit.prevent="save" /></template>\n`,
    },
    {
      name: "conditional preventDefault",
      filename: "src/Search.vue",
      code: sfc(`const onKey = (event) => { if (event.key === "Enter") event.preventDefault(); };\n`),
    },
    {
      name: "short-circuit preventDefault",
      filename: "src/Zoom.vue",
      code: sfc(`const onWheel = (event) => { event.cancelable && event.preventDefault(); };\n`),
    },
    {
      name: "non-passive addEventListener handler",
      filename: "src/Canvas.vue",
      code: sfc(`window.addEventListener("touchmove", (event) => { event.preventDefault(); }, { passive: false });\n`),
    },
    {
      name: "preventDefault on something that is not the handler's event argument",
      filename: "src/Comp.vue",
      code: sfc(`const forward = (inner) => { saved.preventDefault(); inner(); };\n`),
    },
    {
      name: "preventDefault inside a nested callback",
      filename: "src/Comp.vue",
      code: sfc(`const onClick = (event) => { items.forEach(() => { event.preventDefault(); }); };\n`),
    },
    {
      name: "preventDefault after a guard return (ButtonGroup.vue arrow keys)",
      filename: "src/ButtonGroup.vue",
      code: sfc(`const onKeydown = (e: KeyboardEvent) => {\n  if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;\n  e.preventDefault();\n  move(e.key);\n};\n`, ` lang="ts"`),
    },
    {
      name: "named handler registered with addEventListener elsewhere (AvatarCropArea.vue)",
      filename: "src/AvatarCropArea.vue",
      code: sfc(`function onCropperAction(event) {\n  event.preventDefault();\n  apply(event.detail);\n}\nonMounted(() => canvas.value.addEventListener("action", onCropperAction, { capture: true }));\n`),
    },
    {
      name: "named handler registered with useEventListener",
      filename: "src/Shortcuts.vue",
      code: sfc(`const onSave = (event) => {\n  event.preventDefault();\n  save();\n};\nuseEventListener(window, "keydown", onSave);\n`),
    },
    {
      name: "composable file has no template (useLandingDeck.ts)",
      filename: "app/composables/useLandingDeck.ts",
      code: `export const useLandingDeck = () => {\n  const onWheel = (event: WheelEvent) => { event.preventDefault(); step(event.deltaY); };\n  window.addEventListener("wheel", onWheel, { passive: false });\n};\n`,
    },
    {
      name: "plain script handler",
      code: `export const onDrop = (event) => event.preventDefault();\n`,
    },
  ],
  invalid: [
    {
      name: "expression-bodied arrow handler",
      filename: "src/Drop.vue",
      code: sfc(`const onDrop = (event) => event.preventDefault();\n`),
    },
    {
      name: "Options API method",
      filename: "src/Form.vue",
      code: `<script>\nexport default { methods: { onSubmit(event) { event.preventDefault(); this.save(); } } };\n</script>\n`,
    },
    {
      name: "preventDefault in a submit handler",
      filename: "src/Form.vue",
      code: sfc(`function onSubmit(event) { event.preventDefault(); save(); }\n`),
    },
    {
      name: "typed TypeScript handler with a guard after the call (AvatarCropArea.vue style)",
      filename: "src/Crop.vue",
      code: sfc(`function onAction(event: Event) {\n  event.preventDefault();\n  if (props.disabled) return;\n  apply(event);\n}\n`, ` lang="ts"`),
    },
    {
      name: "double-click handler (BasePriceChartSecure.vue)",
      filename: "src/Chart.vue",
      code: sfc(`const handleDoubleClick = (event: MouseEvent) => {\n  event.preventDefault();\n  resetZoom();\n};\n`, ` lang="ts"`),
    },
  ],
};

export default cases;
