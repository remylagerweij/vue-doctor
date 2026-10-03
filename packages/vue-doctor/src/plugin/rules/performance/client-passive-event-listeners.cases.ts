import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "scroll listener marked passive",
      code: `window.addEventListener("scroll", onScroll, { passive: true });\n`,
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
  ],
  invalid: [
    {
      name: "scroll listener without options",
      code: `window.addEventListener("scroll", onScroll);\n`,
    },
    {
      name: "touchstart with capture boolean",
      code: `el.addEventListener("touchstart", onTouch, false);\n`,
    },
    {
      name: "wheel with options lacking passive",
      code: `el.addEventListener("wheel", onWheel, { capture: true });\n`,
    },
  ],
};

export default cases;
