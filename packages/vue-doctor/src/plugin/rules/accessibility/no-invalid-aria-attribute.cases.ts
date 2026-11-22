import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Menu.tsx";

const cases: RuleCases = {
  valid: [
    { name: "aria-labelledby", filename: FILENAME, code: `export const Dialog = () => <div role="dialog" aria-labelledby="t">x</div>;\n` },
    { name: "bound aria-expanded", filename: FILENAME, code: `export const Toggle = (props) => <button aria-expanded={props.open}>Menu</button>;\n` },
    { name: "aria-description (ARIA 1.3)", filename: FILENAME, code: `export const Help = () => <button aria-description="Opens the help panel">?</button>;\n` },
    { name: "aria prop on a component", filename: FILENAME, code: `export const X = () => <Popover aria-labeledby="t" />;\n` },
    { name: "data attribute", filename: FILENAME, code: `export const X = () => <div data-aria-x="1">x</div>;\n` },
  ],
  invalid: [
    { name: "aria-labeledby misspelling", filename: FILENAME, code: `export const Dialog = () => <div role="dialog" aria-labeledby="t">x</div>;\n` },
    { name: "aria-role", filename: FILENAME, code: `export const Nav = () => <nav aria-role="navigation">x</nav>;\n` },
    { name: "made-up aria attribute", filename: FILENAME, code: `export const X = () => <span aria-text="Hi">x</span>;\n` },
  ],
  template: {
    valid: [
      { name: "valid static attributes", code: vue(`  <div role="dialog" aria-modal="true" aria-labelledby="title" aria-describedby="desc">x</div>`) },
      { name: "valid bound attributes", code: vue(`  <button :aria-expanded="open" :aria-controls="menuId" aria-haspopup="menu">Menu</button>`) },
      { name: "aria-like prop on a component", code: vue(`  <BaseDialog aria-labeledby="title" />`) },
      { name: "svg with valid aria", code: vue(`  <svg aria-hidden="true" focusable="false"><use href="#i" /></svg>`) },
      { name: "camelCase prop is not an aria attribute", code: vue(`  <input :ariaLabel="label">`) },
    ],
    invalid: [
      { name: "aria-labeledby", code: vue(`  <section aria-labeledby="heading"><h2 id="heading">News</h2></section>`) },
      { name: "bound misspelled attribute", code: vue(`  <input :aria-describeby="hintId">`) },
      { name: "aria-role on svg", code: vue(`  <svg aria-role="img"><title>Logo</title></svg>`) },
      { name: "two unknown attributes", code: vue(`  <div aria-text="x" aria-name="y">x</div>`), count: 2 },
    ],
  },
};

export default cases;
