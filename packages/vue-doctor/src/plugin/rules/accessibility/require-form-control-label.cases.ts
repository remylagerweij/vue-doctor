import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Form.tsx";

const cases: RuleCases = {
  valid: [
    { name: "wrapped in a label", filename: FILENAME, code: `export const X = () => <div><h2>Sign up</h2><form><label>Email <input type="email" /></label></form></div>;\n` },
    { name: "aria-label", filename: FILENAME, code: `export const X = () => <div><h2>Find</h2><form><input aria-label="Search" /></form></div>;\n` },
    { name: "id for a label elsewhere", filename: FILENAME, code: `export const X = () => <div><h2>Sign up</h2><form><input id="email" /></form></div>;\n` },
    { name: "hidden input", filename: FILENAME, code: `export const X = () => <div><h2>Sign up</h2><form><input type="hidden" name="t" value="x" /></form></div>;\n` },
    { name: "root input receives fallthrough attributes", filename: FILENAME, code: `export const X = () => <input type="text" />;\n` },
    { name: "spread props", filename: FILENAME, code: `export const X = (p) => <div><h2>Sign up</h2><input {...p} /></div>;\n` },
    { name: "control wrapper without text", filename: FILENAME, code: `export const X = () => <div className="checkbox"><input type="checkbox" /><svg><path d="M0 0" /></svg></div>;\n` },
  ],
  invalid: [
    { name: "unlabelled input", filename: FILENAME, code: `export const X = () => <div><h2>Newsletter</h2><form><input type="email" /></form></div>;\n` },
    { name: "unlabelled select", filename: FILENAME, code: `export const X = () => <div>Size: <select><option>A</option></select></div>;\n` },
    { name: "unlabelled textarea", filename: FILENAME, code: `export const X = () => <div><span>Notes</span><textarea /></div>;\n` },
  ],
  template: {
    valid: [
      { name: "label wraps the input", code: vue(`  <div><form><label>Email <input v-model="email" type="email"></label></form></div>`) },
      { name: "id for a label", code: vue(`  <div><form><label for="email">Email</label><input id="email" v-model="email"></form></div>`) },
      { name: "bound id", code: vue(`  <div><div><label :for="id">Name</label><input :id="id" v-model="name"></div></div>`) },
      { name: "aria-label", code: vue(`  <div><h2>Products</h2><input v-model="q" type="search" aria-label="Search products"></div>`) },
      { name: "aria-labelledby", code: vue(`  <div><div><h2 id="t">Qty</h2><input type="number" aria-labelledby="t"></div></div>`) },
      { name: "placeholder", code: vue(`  <div><h2>Products</h2><input v-model="q" placeholder="Search"></div>`) },
      { name: "root input receives aria-label through attribute fallthrough", code: vue(`  <input v-model="model" type="text">`) },
      { name: "submit button input", code: vue(`  <div><h2>Contact</h2><form><input type="submit" value="Send"></form></div>`) },
      { name: "bound type", code: vue(`  <div><h2>Account</h2><input :type="kind" v-model="v"></div>`) },
      { name: "inside a form-item component", code: vue(`  <div><h2>Profile</h2><el-form><el-form-item label="Name"><input v-model="name"></el-form-item></el-form></div>`) },
      { name: "inside a component with a label prop", code: vue(`  <div><h2>Profile</h2><FieldWrapper label="Name"><input v-model="name"></FieldWrapper></div>`) },
      { name: "hidden file input behind a button", code: vue(`  <div><button @click="pick">Upload</button><input ref="file" type="file" class="hidden" @change="upload"></div>`) },
      { name: "display none", code: vue(`  <div><p>Avatar</p><input type="file" style="display: none" @change="upload"></div>`) },
      { name: "v-show false", code: vue(`  <div><span>{{ hint }}</span><input v-show="false" type="file" @change="pick"></div>`) },
      { name: "file input with a ref opened by a button", code: vue(`  <div><input ref="excel" class="excel-input" type="file" @change="read"><div class="drop">Drop a file or <button @click="excel.click()">Browse</button></div></div>`) },
      { name: "v-bind object", code: vue(`  <div><h2>Profile</h2><input v-bind="$attrs"></div>`) },
      { name: "custom component input", code: vue(`  <div><h2>Profile</h2><BaseInput v-model="name" /></div>`) },
      { name: "checkbox wrapper component without text", code: vue(`  <div class="relative w-4 h-4"><input type="checkbox" :checked="modelValue" @change="toggle"><svg viewBox="0 0 14 14"><path d="M3 8L6 11L11 3.5" /></svg></div>`) },
      { name: "select wrapper component without text", code: vue(`  <div class="select"><select :value="modelValue"><option v-for="o in options" :key="o.value">{{ o.label }}</option></select><Icon name="chevron" /></div>`) },
    ],
    invalid: [
      { name: "unlabelled input", code: vue(`  <div><h2>Newsletter</h2><form @submit.prevent="save"><input v-model="email" type="email"><button>Save</button></form></div>`) },
      { name: "text next to an input is not a label", code: vue(`  <div><div><span>Quantity</span><input v-model.number="qty" type="number"></div></div>`) },
      { name: "unlabelled select", code: vue(`  <div><p>Size</p><select v-model="size"><option>S</option><option>M</option></select></div>`) },
      { name: "unlabelled textarea", code: vue(`  <div class="field"><h3>{{ t('notes') }}</h3><textarea v-model="notes"></textarea></div>`) },
      { name: "unlabelled checkbox", code: vue(`  <div><ul><li v-for="t in todos" :key="t.id"><input type="checkbox" v-model="t.done"> {{ t.title }}</li></ul></div>`) },
      { name: "v-show bound to state", code: vue(`  <div><p>Zoom</p><input v-show="ready" type="range" :value="scale" @input="zoom"></div>`) },
      { name: "file input without a ref", code: vue(`  <div><p>Attachment</p><input type="file" @change="read"></div>`) },
      { name: "label for an id the checkbox does not have", code: vue(`  <div><input v-model="show" type="checkbox"><label for="show-on-sidebar">Show on sidebar</label></div>`) },
    ],
  },
};

export default cases;
