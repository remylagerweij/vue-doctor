import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "touchmove listener marked passive",
      code: `window.addEventListener("touchmove", onMove, { passive: true });\n`,
    },
    {
      name: "passive together with other options",
      code: `el.addEventListener("touchmove", onMove, { passive: true, once: true });\n`,
    },
    {
      name: "events that are not scroll-blocking",
      code: `button.addEventListener("click", onClick);\nwindow.addEventListener("resize", onResize);\n`,
    },
    {
      name: "dynamic event name cannot be judged",
      code: `export const listen = (name, handler) => window.addEventListener(name, handler);\n`,
    },
    {
      name: "touchend cannot block scrolling",
      filename: "src/MarketConstellation.vue",
      code: `<script setup>\nfunction onTouchStart() {\n  window.addEventListener("touchmove", onTouchMove, { passive: true });\n  window.addEventListener("touchend", onTouchEnd);\n}\n</script>\n`,
    },
    {
      name: "scroll is not cancelable, so passive changes nothing",
      filename: "src/Dropdown.vue",
      code: `<script setup>\nonMounted(() => {\n  window.addEventListener("scroll", handleWindowEvents, true);\n});\n</script>\n`,
    },
    {
      name: "named handler that calls preventDefault must stay active",
      code: `function onWheel(event) {\n  event.preventDefault();\n  zoom(event.deltaY);\n}\nel.addEventListener("wheel", onWheel);\n`,
    },
    {
      name: "inline handler that calls preventDefault",
      code: `el.addEventListener("touchmove", (event) => { if (dragging) event.preventDefault(); });\n`,
    },
  ],
  invalid: [
    {
      name: "wheel listener without options",
      code: `window.addEventListener("wheel", onWheel);\n`,
    },
    {
      name: "touchstart with capture boolean",
      code: `el.addEventListener("touchstart", onTouch, false);\n`,
    },
    {
      name: "wheel with options lacking passive",
      code: `el.addEventListener("wheel", onWheel, { capture: true });\n`,
    },
    {
      name: "named arrow handler that never cancels",
      code: `const onMove = (event) => { position.value = event.touches[0].clientX; };\nel.addEventListener("touchmove", onMove);\n`,
    },
    {
      name: "legacy mousewheel event",
      code: `el.addEventListener("mousewheel", onWheel);\n`,
    },
  ],
};

export default cases;
