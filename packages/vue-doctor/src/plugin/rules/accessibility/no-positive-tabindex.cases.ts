import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Toolbar.tsx";

const cases: RuleCases = {
  valid: [
    { name: "tabIndex zero", filename: FILENAME, code: `export const Card = () => <div tabIndex={0}>Card</div>;\n` },
    { name: "negative tabIndex", filename: FILENAME, code: `export const Panel = () => <div tabIndex={-1}>Panel</div>;\n` },
    { name: "bound tabIndex", filename: FILENAME, code: `export const Item = (props) => <li tabIndex={props.index}>Item</li>;\n` },
    { name: "positive tabIndex on a component", filename: FILENAME, code: `export const X = () => <Widget tabIndex={2} />;\n` },
  ],
  invalid: [
    { name: "tabIndex 1", filename: FILENAME, code: `export const First = () => <button tabIndex={1}>Go</button>;\n` },
    { name: "string tabindex 3", filename: FILENAME, code: `export const Field = () => <input tabindex="3" aria-label="Name" />;\n` },
    { name: "tabIndex in nested markup", filename: FILENAME, code: `export const Form = () => <form><a href="/" tabIndex={5}>Home</a></form>;\n` },
  ],
  template: {
    valid: [
      { name: "tabindex 0", code: vue(`  <div tabindex="0">Card</div>`) },
      { name: "tabindex -1", code: vue(`  <div tabindex="-1" ref="panel">Panel</div>`) },
      { name: "bound tabindex", code: vue(`  <li v-for="(item, i) in items" :key="item.id" :tabindex="i === active ? 0 : -1">{{ item.label }}</li>`) },
      { name: "bound zero", code: vue(`  <span :tabindex="0">Focusable</span>`) },
      { name: "component with tabindex prop", code: vue(`  <MyInput tabindex="2" />`) },
    ],
    invalid: [
      { name: "static tabindex 1", code: vue(`  <input tabindex="1" aria-label="Search">`) },
      { name: "bound literal tabindex 2", code: vue(`  <button :tabindex="2">Next</button>`) },
      { name: "two positive tabindexes", code: vue(`  <form><input tabindex="1" aria-label="User"><input tabindex="2" aria-label="Password"></form>`), count: 2 },
    ],
  },
};

export default cases;
