import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Toggle.tsx";

const cases: RuleCases = {
  valid: [
    { name: "checkbox role with aria-checked", filename: FILENAME, code: `export const X = (p) => <div><div role="checkbox" aria-checked={p.on} tabIndex={0}>x</div></div>;\n` },
    { name: "native checkbox as a switch", filename: FILENAME, code: `export const X = () => <div><input type="checkbox" role="switch" /></div>;\n` },
    { name: "slider with aria-valuenow", filename: FILENAME, code: `export const X = (p) => <div><div role="slider" aria-valuenow={p.v} aria-valuemin={0} aria-valuemax={100} tabIndex={0} /></div>;\n` },
    { name: "role on a component", filename: FILENAME, code: `export const X = () => <div><Toggle role="switch" /></div>;\n` },
    { name: "spread props", filename: FILENAME, code: `export const X = (p) => <div><div role="switch" {...p}>x</div></div>;\n` },
  ],
  invalid: [
    { name: "checkbox without aria-checked", filename: FILENAME, code: `export const X = () => <div><div role="checkbox" tabIndex={0}>x</div></div>;\n` },
    { name: "slider without aria-valuenow", filename: FILENAME, code: `export const X = () => <div><div role="slider" tabIndex={0} /></div>;\n` },
    { name: "combobox without aria-expanded", filename: FILENAME, code: `export const X = () => <div><input role="combobox" aria-label="City" /></div>;\n` },
  ],
  template: {
    valid: [
      { name: "root switch receives aria-checked through attribute fallthrough", code: vue(`  <button class="switch" type="button" role="switch"><span class="check"></span></button>`) },
      { name: "switch with bound aria-checked", code: vue(`  <div><button role="switch" :aria-checked="enabled" @click="toggle">Wi-Fi</button></div>`) },
      { name: "native radio with radio role", code: vue(`  <div><input type="radio" role="radio" name="size" value="s"></div>`) },
      { name: "native range with slider role", code: vue(`  <div><input type="range" role="slider" aria-label="Volume"></div>`) },
      { name: "combobox with aria-expanded", code: vue(`  <div><input role="combobox" :aria-expanded="open" aria-controls="list" aria-label="City"></div>`) },
      { name: "heading role has an implicit level", code: vue(`  <div><div role="heading">Title</div></div>`) },
      { name: "bound role", code: vue(`  <div><div :role="kind">x</div></div>`) },
      { name: "native select as combobox", code: vue(`  <div><select role="combobox" aria-label="Size"><option>S</option></select></div>`) },
    ],
    invalid: [
      { name: "switch without aria-checked", code: vue(`  <div><div role="switch" tabindex="0" @click="toggle" @keydown.space="toggle">Wi-Fi</div></div>`) },
      { name: "menuitemcheckbox without aria-checked", code: vue(`  <div><ul role="menu"><li role="menuitemcheckbox">Bold</li></ul></div>`) },
      { name: "radio without aria-checked", code: vue(`  <div><div role="radiogroup"><span role="radio" tabindex="0">Small</span></div></div>`) },
      { name: "slider without aria-valuenow", code: vue(`  <div><div role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="10"></div></div>`) },
    ],
  },
};

export default cases;
