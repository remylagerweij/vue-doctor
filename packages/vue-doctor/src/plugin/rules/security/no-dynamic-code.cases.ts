import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "setTimeout and setInterval with functions",
      code: `export const later = (run) => {\n  setTimeout(run, 100);\n  setTimeout(() => run(), 100);\n  window.setInterval(function tick() { run(); }, 1000);\n};\n`,
    },
    {
      name: "new Function with only constant strings",
      code: `export const identity = new Function("value", "return value");\n`,
    },
    {
      name: "unrelated Function usage",
      code: `export const isFunction = (value) => typeof value === "function" || value instanceof Function;\nexport const noop = Function.prototype;\n`,
    },
    {
      name: "component with a literal template string",
      code: `import { defineComponent } from "vue";\nexport default defineComponent({ template: "<div>static</div>" });\n`,
    },
    {
      name: "compile imported from vue with a literal template",
      code: `import { compile } from "vue";\nexport const render = compile("<div>static</div>");\n`,
    },
    {
      name: "compile that is not the Vue runtime compiler",
      code: `import { compile } from "ejs";\nexport const render = (source) => compile(source);\n`,
    },
    {
      name: "component using a render function",
      code: `import { defineComponent, h } from "vue";\nexport default defineComponent({ props: ["tag"], render() { return h(this.tag); } });\n`,
    },
  ],
  invalid: [
    {
      name: "new Function with a variable body",
      code: `export const build = (body) => new Function("a", "b", body);\n`,
    },
    {
      name: "new Function with a concatenated body",
      code: `export const build = (expression) => new Function("return " + expression);\n`,
    },
    {
      name: "Function called without new",
      code: `export const build = (code) => Function(code)();\n`,
    },
    {
      name: "window.Function constructor",
      code: `export const build = (code) => new window.Function(code);\n`,
    },
    {
      name: "setTimeout with a string",
      code: `export const later = () => { setTimeout("refresh()", 500); };\n`,
    },
    {
      name: "setInterval with a template literal",
      code: "export const poll = (name) => { setInterval(`update(${name})`, 500); };\n",
    },
    {
      name: "window.setTimeout with a concatenated string",
      code: `export const later = (id) => { window.setTimeout("close(" + id + ")", 500); };\n`,
    },
    {
      name: "compile from vue with a dynamic template",
      code: `import { compile } from "vue";\nexport const render = (template) => compile(template);\n`,
    },
    {
      name: "aliased compile from vue",
      code: `import { compile as compileTemplate } from "vue";\nexport const render = (html) => compileTemplate(html);\n`,
    },
    {
      name: "Vue.compile with a dynamic template",
      code: `import Vue from "vue";\nexport const render = (template) => Vue.compile(template);\n`,
    },
    {
      name: "defineComponent with a dynamic template",
      code: `import { defineComponent } from "vue";\nexport const make = (template) => defineComponent({ template });\n`,
    },
    {
      name: "createApp with an interpolated template",
      code: "import { createApp } from \"vue\";\nexport const mount = (name) => createApp({ template: `<p>Hello ${name}</p>` });\n",
    },
    {
      name: "default-exported component with a template from props",
      filename: "src/Dynamic.vue",
      code: `<script>\nconst source = window.cmsTemplate;\nexport default {\n  template: source,\n};\n</script>\n`,
    },
  ],
};

export default cases;
