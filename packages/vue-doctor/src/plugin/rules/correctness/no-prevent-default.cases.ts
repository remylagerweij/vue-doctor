import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "stopPropagation is a different concern",
      code: `export const onClick = (event) => { event.stopPropagation(); };\n`,
    },
    {
      name: "reading defaultPrevented",
      code: `export const handled = (event) => event.defaultPrevented;\n`,
    },
    {
      name: "unrelated function named like the method",
      code: `const preventDefault = () => {};\npreventDefault();\n`,
    },
    {
      name: "template modifier instead of calling the method",
      filename: "src/Form.vue",
      code: `<script setup>\nconst save = () => {};\n</script>\n<template><form @submit.prevent="save" /></template>\n`,
    },
    {
      name: "conditional preventDefault",
      code: `export const onKey = (event) => { if (event.key === "Enter") event.preventDefault(); };\n`,
    },
    {
      name: "short-circuit preventDefault",
      code: `export const onWheel = (event) => { event.cancelable && event.preventDefault(); };\n`,
    },
    {
      name: "non-passive addEventListener handler",
      code: `window.addEventListener("touchmove", (event) => { event.preventDefault(); }, { passive: false });\n`,
    },
    {
      name: "preventDefault on something that is not the handler's event argument",
      code: `export const forward = (inner) => { saved.preventDefault(); inner(); };\n`,
    },
    {
      name: "preventDefault inside a nested callback",
      code: `export const onClick = (event) => { items.forEach(() => { event.preventDefault(); }); };\n`,
    },
  ],
  invalid: [
    {
      name: "expression-bodied arrow handler",
      code: `export const onDrop = (event) => event.preventDefault();\n`,
    },
    {
      name: "Options API method",
      code: `export default { methods: { onSubmit(event) { event.preventDefault(); this.save(); } } };\n`,
    },
    {
      name: "preventDefault in a submit handler",
      filename: "src/Form.vue",
      code: `<script setup>\nfunction onSubmit(event) { event.preventDefault(); save(); }\n</script>\n`,
    },
    {
      name: "arrow handler",
      code: `export const onDrop = (e) => { e.preventDefault(); };\n`,
    },
    {
      name: "typed TypeScript handler",
      code: `export function onKey(event: KeyboardEvent) { event.preventDefault(); }\n`,
    },
  ],
};

export default cases;
