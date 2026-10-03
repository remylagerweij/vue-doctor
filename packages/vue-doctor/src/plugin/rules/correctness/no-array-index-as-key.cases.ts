import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "index used for display, not as a key",
      code: "export const labels = items.map((item, index) => `${index + 1}. ${item}`);\n",
    },
    {
      name: "index parameter present but unused",
      code: `export const ids = items.map((item, index) => ({ id: item.id }));\n`,
    },
    {
      name: "stable id key next to an index argument",
      code: `export const rows = items.map((item, index) => h("li", { key: item.id }, index));\n`,
    },
    {
      name: "second parameter with a name that is not an index name",
      code: `export const rows = items.map((item, position) => h("li", { key: position }));\n`,
    },
  ],
  invalid: [
    {
      name: "render function keyed by index",
      code: `export const rows = items.map((item, index) => h("li", { key: index }, item));\n`,
    },
    {
      name: "function expression callback keyed by idx",
      code: `export const rows = items.map(function (item, idx) { return h(Row, { key: idx }); });\n`,
    },
    {
      name: "template literal key built from the index",
      code: "export const rows = items.map((item, i) => h(\"li\", { key: `row-${i}` }, item));\n",
    },
    {
      name: "JSX key attribute",
      filename: "src/List.tsx",
      code: `export const rows = items.map((item, index) => <li key={index}>{item}</li>);\n`,
    },
  ],
};

export default cases;
