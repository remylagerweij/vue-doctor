import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Icon.tsx";

const cases: RuleCases = {
  valid: [
    { name: "aria-hidden icon", filename: FILENAME, code: `export const X = () => <span aria-hidden="true">★</span>;\n` },
    { name: "aria-hidden link out of tab order", filename: FILENAME, code: `export const X = () => <a href="/" aria-hidden="true" tabIndex={-1}>Logo</a>;\n` },
    { name: "aria-hidden false on a button", filename: FILENAME, code: `export const X = () => <button aria-hidden="false">Go</button>;\n` },
    { name: "bound aria-hidden", filename: FILENAME, code: `export const X = (props) => <button aria-hidden={props.hidden}>Go</button>;\n` },
    { name: "disabled hidden button", filename: FILENAME, code: `export const X = () => <button aria-hidden="true" disabled>Go</button>;\n` },
  ],
  invalid: [
    { name: "aria-hidden button", filename: FILENAME, code: `export const X = () => <button aria-hidden="true">Close</button>;\n` },
    { name: "aria-hidden link", filename: FILENAME, code: `export const X = () => <a href="/home" aria-hidden="true">Home</a>;\n` },
    { name: "aria-hidden div with tabIndex 0", filename: FILENAME, code: `export const X = () => <div tabIndex={0} aria-hidden="true">x</div>;\n` },
  ],
  template: {
    valid: [
      { name: "hidden attribute", code: vue(`  <div><button hidden aria-hidden="true">x</button></div>`) },
      { name: "v-show false", code: vue(`  <div><a href="#" aria-hidden="true" v-show="false">x</a></div>`) },
      { name: "inert ancestor", code: vue(`  <div inert><button aria-hidden="true">Dup</button></div>`) },
      { name: "inline display none", code: vue(`  <div><button aria-hidden="true" style="display: none">x</button></div>`) },
      { name: "aria-hidden decorative svg", code: vue(`  <button aria-label="Close"><svg aria-hidden="true"><use href="#x" /></svg></button>`) },
      { name: "duplicate link removed from tab order", code: vue(`  <a href="/post/1" aria-hidden="true" tabindex="-1"><img src="/t.png" alt=""></a>`) },
      { name: "anchor without href", code: vue(`  <a aria-hidden="true" name="top"></a>`) },
      { name: "hidden input", code: vue(`  <input type="hidden" aria-hidden="true" name="token" value="x">`) },
      { name: "component with aria-hidden", code: vue(`  <BaseButton aria-hidden="true" />`) },
      { name: "bound tabindex", code: vue(`  <div :tabindex="focusable ? 0 : -1" aria-hidden="true">x</div>`) },
      { name: "bound disabled", code: vue(`  <button :disabled="busy" aria-hidden="true">x</button>`) },
    ],
    invalid: [
      { name: "aria-hidden button", code: vue(`  <button aria-hidden="true" @click="close">×</button>`) },
      { name: "bound literal aria-hidden on a link", code: vue(`  <a :href="url" :aria-hidden="true">Read more</a>`) },
      { name: "aria-hidden input", code: vue(`  <input type="text" aria-hidden="true" aria-label="Honeypot">`) },
      { name: "aria-hidden element with tabindex 0", code: vue(`  <div tabindex="0" aria-hidden="true">x</div>`) },
    ],
  },
};

export default cases;
