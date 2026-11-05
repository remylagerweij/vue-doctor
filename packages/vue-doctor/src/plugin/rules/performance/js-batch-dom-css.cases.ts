import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "single style assignment",
      code: `export const hide = (el) => { el.style.display = "none"; };\n`,
    },
    {
      name: "consecutive style writes are batched by the browser",
      code: `export const place = (el) => {\n  el.style.top = "1px";\n  el.style.left = "2px";\n  el.style.width = "10px";\n};\n`,
    },
    {
      name: "transition set before the height it animates",
      filename: "src/AccordionItem.vue",
      code: `<script setup>\nconst onLeave = (el, done) => {\n  requestAnimationFrame(() => {\n    el.style.transition = "height 300ms ease";\n    el.style.height = "0px";\n  });\n  setTimeout(done, 300);\n};\nconst onBeforeLeave = (el) => {\n  el.style.height = el.scrollHeight + "px";\n};\n</script>\n`,
    },
    {
      name: "read first, then write",
      filename: "src/useMagneticButton.ts",
      code: `export function handleMove(event, el) {\n  const rect = el.getBoundingClientRect();\n  const x = event.clientX - rect.left - rect.width / 2;\n  el.style.transition = "none";\n  el.style.transform = \`translate(\${x}px, 0)\`;\n}\n`,
    },
    {
      name: "a bare offsetHeight read restarts a transition on purpose",
      code: `export const restart = (el) => {\n  el.style.animation = "none";\n  void el.offsetHeight;\n  el.style.animation = "";\n};\n`,
    },
    {
      name: "the read happens later in a frame callback",
      code: `export const grow = (el) => {\n  el.style.height = "0px";\n  requestAnimationFrame(() => { el.style.height = el.scrollHeight + "px"; });\n};\n`,
    },
  ],
  invalid: [
    {
      name: "write, layout read, write",
      code: `export const resize = (el) => {\n  el.style.width = "100px";\n  const height = el.offsetHeight;\n  el.style.height = height + "px";\n};\n`,
    },
    {
      name: "getBoundingClientRect between class and style writes",
      code: `export const open = (panel) => {\n  panel.classList.add("open");\n  const { height } = panel.getBoundingClientRect();\n  panel.style.maxHeight = height + "px";\n};\n`,
    },
    {
      name: "loop body that reads and writes layout",
      code: `export const fit = (items) => {\n  for (const item of items) {\n    item.style.height = item.scrollHeight + "px";\n  }\n};\n`,
    },
    {
      name: "forEach callback that writes then measures",
      filename: "src/Comp.vue",
      code: `<script setup>\nfunction layout(cards) {\n  cards.forEach((card) => {\n    card.style.width = "auto";\n    widths.push(getComputedStyle(card).width);\n  });\n}\n</script>\n`,
    },
  ],
};

export default cases;
