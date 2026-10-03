import type { RuleCases } from "../../rule-cases.js";

const vue = (script: string, template: string): string =>
  `<script setup>\n${script}\n</script>\n<template>\n${template}\n</template>\n`;

const FILENAME = "src/Comp.vue";

const cases: RuleCases = {
  valid: [
    {
      name: "textContent assignment",
      code: `export const setText = (el, text) => { el.textContent = text; };\n`,
    },
    {
      name: "innerText assignment",
      code: `export const setText = (el, text) => { el.innerText = text; };\n`,
    },
    {
      name: "innerHTML assigned a string literal",
      code: `export const reset = (el) => { el.innerHTML = ""; el.outerHTML = "<hr>"; };\n`,
    },
    {
      name: "innerHTML assigned a template literal without interpolation",
      code: "export const render = (el) => { el.innerHTML = `<p>Hello</p>`; };\n",
    },
    {
      name: "innerHTML assigned a DOMPurify.sanitize call",
      code: `import DOMPurify from "dompurify";\nexport const render = (el, html) => { el.innerHTML = DOMPurify.sanitize(html); };\n`,
    },
    {
      name: "insertAdjacentHTML with a sanitizeHtml call",
      code: `import sanitizeHtml from "sanitize-html";\nexport const append = (el, html) => { el.insertAdjacentHTML("beforeend", sanitizeHtml(html)); };\n`,
    },
    {
      name: "innerHTML assigned a const bound to a sanitizer call",
      code: `import DOMPurify from "dompurify";\nexport const render = (el, html) => {\n  const clean = DOMPurify.sanitize(html);\n  el.innerHTML = clean;\n};\n`,
    },
    {
      name: "innerHTML assigned a sanitized computed value",
      code: `import { computed } from "vue";\nimport DOMPurify from "dompurify";\nexport const useHtml = (el, raw) => {\n  const safe = computed(() => DOMPurify.sanitize(raw.value));\n  el.innerHTML = safe.value;\n};\n`,
    },
    {
      name: "render function with a text child and a sanitized innerHTML",
      code: `import { h } from "vue";\nimport DOMPurify from "dompurify";\nexport const Safe = (props) => h("div", { innerHTML: DOMPurify.sanitize(props.html) });\nexport const Text = (props) => h("div", { class: "x" }, props.text);\n`,
    },
    {
      name: "document.write with a literal",
      code: `export const boot = () => { document.write("<p>loading</p>"); };\n`,
    },
    {
      name: "unrelated innerHTML property in a plain object",
      code: `export const config = { innerHTML: userInput };\n`,
    },
    {
      name: "JSX with a sanitized innerHTML and a text child",
      filename: "src/Comp.jsx",
      code: `import DOMPurify from "dompurify";\nexport const Safe = ({ html, text }) => (\n  <div>\n    <p innerHTML={DOMPurify.sanitize(html)} />\n    <p>{text}</p>\n  </div>\n);\n`,
    },
  ],
  invalid: [
    {
      name: "innerHTML assigned a variable",
      code: `export const render = (el, html) => { el.innerHTML = html; };\n`,
    },
    {
      name: "innerHTML assigned an interpolated template literal",
      code: "export const render = (el, name) => { el.innerHTML = `<b>${name}</b>`; };\n",
    },
    {
      name: "innerHTML appended with +=",
      code: `export const append = (el, html) => { el.innerHTML += html; };\n`,
    },
    {
      name: "outerHTML assigned a variable",
      code: `export const replace = (el, html) => { el.outerHTML = html; };\n`,
    },
    {
      name: "insertAdjacentHTML with a variable",
      code: `export const append = (el, html) => { el.insertAdjacentHTML("beforeend", html); };\n`,
    },
    {
      name: "document.write with a variable",
      code: `export const boot = (html) => { document.write(html); };\n`,
    },
    {
      name: "const merely named sanitized is not trusted",
      code: `export const render = (el, html) => { const sanitized = html; el.innerHTML = sanitized; };\n`,
    },
    {
      name: "h() with an innerHTML prop",
      code: `import { h } from "vue";\nexport const Raw = (props) => h("div", { innerHTML: props.html });\n`,
    },
    {
      name: "Vue 2 render function with domProps innerHTML",
      code: `export default {\n  render(createElement) {\n    return createElement("div", { domProps: { innerHTML: this.html } });\n  },\n};\n`,
    },
    {
      name: "JSX innerHTML attribute",
      filename: "src/Comp.jsx",
      code: `export const Raw = ({ html }) => <div innerHTML={html} />;\n`,
    },
    {
      name: "JSX v-html attribute",
      filename: "src/Comp.jsx",
      code: `export const Raw = ({ html }) => <div v-html={html} />;\n`,
    },
    {
      name: "setHTMLUnsafe with a variable",
      code: `export const render = (el, html) => { el.setHTMLUnsafe(html); };\n`,
    },
    {
      name: "innerHTML in a <script setup> block",
      filename: FILENAME,
      code: vue(`import { onMounted, ref } from "vue";\nconst el = ref(null);\nconst props = defineProps(["html"]);\nonMounted(() => { el.value.innerHTML = props.html; });`, `<div ref="el" />`),
    },
  ],
  template: {
    valid: [
      { name: "text interpolation", filename: FILENAME, code: vue("", `<div>{{ html }}</div>`) },
      { name: "v-html with a string literal", filename: FILENAME, code: vue("", `<div v-html="'<b>bold</b>'"></div>`) },
      { name: "v-html with a DOMPurify.sanitize call", filename: FILENAME, code: vue("import DOMPurify from 'dompurify'\ndefineProps(['html'])", `<div v-html="DOMPurify.sanitize(html)"></div>`) },
      { name: "v-html with sanitizeHtml and a fallback literal", filename: FILENAME, code: vue("defineProps(['html'])", `<div v-html="html ? sanitizeHtml(html) : ''"></div>`) },
      { name: "v-html with $sanitize", filename: FILENAME, code: vue("defineProps(['html'])", `<div v-html="$sanitize(html)"></div>`) },
      { name: "v-bind of innerHTML with a sanitized value", filename: FILENAME, code: vue("defineProps(['html'])", `<div :innerHTML.prop="DOMPurify.sanitize(html)"></div>`) },
      { name: "unrelated v-bind", filename: FILENAME, code: vue("defineProps(['title'])", `<div :title="title" :class="{ a: true }"></div>`) },
    ],
    invalid: [
      { name: "v-html with a variable", filename: FILENAME, code: vue("defineProps(['html'])", `<div v-html="html"></div>`) },
      { name: "v-html with a member expression", filename: FILENAME, code: vue("", `<div v-html="post.body"></div>`) },
      { name: "v-html with a variable named like a sanitized value", filename: FILENAME, code: vue("defineProps(['sanitizedHtml'])", `<div v-html="sanitizedHtml"></div>`) },
      { name: "v-html with an interpolated template literal", filename: FILENAME, code: vue("defineProps(['name'])", "<div v-html=\"`<b>${name}</b>`\"></div>") },
      { name: "v-html with a ternary where one branch is raw", filename: FILENAME, code: vue("defineProps(['html'])", `<div v-html="html ? html : ''"></div>`) },
      { name: "v-html on a component", filename: FILENAME, code: vue("import Card from './Card.vue'\ndefineProps(['html'])", `<Card v-html="html" />`) },
      { name: "v-bind of innerHTML", filename: FILENAME, code: vue("defineProps(['html'])", `<div :innerHTML.prop="html"></div>`) },
      { name: "v-bind object with innerHTML", filename: FILENAME, code: vue("defineProps(['html'])", `<div v-bind="{ innerHTML: html }"></div>`) },
    ],
  },
};

export default cases;
