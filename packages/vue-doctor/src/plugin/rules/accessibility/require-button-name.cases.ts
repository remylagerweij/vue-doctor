import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Actions.tsx";

const cases: RuleCases = {
  valid: [
    { name: "button with text", filename: FILENAME, code: `export const X = () => <div><button type="button">Save</button></div>;\n` },
    { name: "icon button with aria-label", filename: FILENAME, code: `export const X = () => <div><button aria-label="Close"><svg><path d="M0 0" /></svg></button></div>;\n` },
    { name: "button with a component child", filename: FILENAME, code: `export const X = () => <div><button><CloseIcon /></button></div>;\n` },
    { name: "button with an expression", filename: FILENAME, code: `export const X = (p) => <div><button>{p.label}</button></div>;\n` },
    { name: "button with spread props", filename: FILENAME, code: `export const X = (p) => <div><button {...p} /></div>;\n` },
  ],
  invalid: [
    { name: "empty button", filename: FILENAME, code: `export const X = () => <div><button className="hamburger" /></div>;\n` },
    { name: "svg-only button", filename: FILENAME, code: `export const X = () => <div><button><svg viewBox="0 0 24 24"><path d="M0 0" /></svg></button></div>;\n` },
    { name: "icon-font-only button", filename: FILENAME, code: `export const X = () => <div><button type="button"><i className="mdi mdi-close" /></button></div>;\n` },
  ],
  template: {
    valid: [
      { name: "root icon button receives aria-label through attribute fallthrough", code: vue(`  <button type="button" class="icon-button"><span class="i-sparkles" aria-hidden="true"></span></button>`) },
      { name: "text", code: vue(`  <div><button type="submit">Sign in</button></div>`) },
      { name: "interpolation", code: vue(`  <div><button @click="next">{{ t('next') }}</button></div>`) },
      { name: "aria-label", code: vue(`  <div><button aria-label="Close" @click="close"><i class="i-close" aria-hidden="true"></i></button></div>`) },
      { name: "bound aria-label", code: vue(`  <div><button :aria-label="t('menu')"><svg><use href="#menu" /></svg></button></div>`) },
      { name: "icon component child", code: vue(`  <div><button @click="close"><Icon name="close" /></button></div>`) },
      { name: "sr-only text", code: vue(`  <div><button><i class="fa fa-trash"></i><span class="visually-hidden">Delete</span></button></div>`) },
      { name: "v-html content", code: vue(`  <div><button v-html="label"></button></div>`) },
      { name: "slot", code: vue(`  <div><button class="btn"><slot /></button></div>`) },
      { name: "title", code: vue(`  <div><button title="Refresh"><i class="i-refresh"></i></button></div>`) },
      { name: "aria-labelledby", code: vue(`  <div><div><span id="l">Play</span><button aria-labelledby="l"><svg><path d="M0 0" /></svg></button></div></div>`) },
      { name: "BaseButton component", code: vue(`  <div><BaseButton icon="close" /></div>`) },
      { name: "svg with title", code: vue(`  <div><button><svg><title>Search</title><path d="M0 0" /></svg></button></div>`) },
    ],
    invalid: [
      { name: "empty button", code: vue(`  <div><button class="hamburger" @click="toggle"></button></div>`) },
      { name: "icon font only", code: vue(`  <div><button @click="remove(item)"><i class="fa fa-trash"></i></button></div>`) },
      { name: "svg only", code: vue(`  <div><button type="button"><svg viewBox="0 0 24 24"><path d="M6 6l12 12" /></svg></button></div>`) },
      { name: "aria-hidden icon only", code: vue(`  <div><button><span class="icon" aria-hidden="true">×</span></button></div>`) },
    ],
  },
};

export default cases;
