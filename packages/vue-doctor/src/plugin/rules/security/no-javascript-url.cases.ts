import type { RuleCases } from "../../rule-cases.js";

const vue = (script: string, template: string): string =>
  `${script ? `<script setup>\n${script}\n</script>\n` : ""}<template>\n${template}\n</template>\n`;

const FILENAME = "src/Comp.vue";

const cases: RuleCases = {
  valid: [
    {
      name: "blocklist comparison with startsWith",
      code: `export const isSafe = (url) => !url.trim().toLowerCase().startsWith("javascript:");\n`,
    },
    {
      name: "blocklist array of schemes",
      code: `export const BLOCKED_SCHEMES = ["javascript:", "data:", "vbscript:"];\n`,
    },
    {
      name: "equality comparison with a scheme",
      code: `export const isScript = (url) => url.protocol === "javascript:";\n`,
    },
    {
      name: "ordinary URLs and strings that mention javascript",
      code: `export const links = ["https://example.com", "/docs/javascript", "about:blank"];\nexport const label = "javascript";\n`,
    },
    {
      name: "location assignment of a literal https URL",
      code: `export const go = () => { window.location.href = "https://example.com/docs"; };\n`,
    },
  ],
  invalid: [
    {
      name: "href assignment of javascript:void(0)",
      code: `export const prepare = (a) => { a.href = "javascript:void(0)"; };\n`,
    },
    {
      name: "location.href assignment of a javascript: URL",
      code: `export const go = () => { location.href = "javascript:alert(document.domain)"; };\n`,
    },
    {
      name: "javascript: prefix in a template literal",
      code: "export const link = (code) => `javascript:${code}`;\n",
    },
    {
      name: "javascript: prefix concatenated with a variable",
      code: `export const link = (code) => "javascript:" + code;\n`,
    },
    {
      name: "javascript: URL with whitespace and mixed case",
      code: `export const link = { href: "  JavaScript:void(0)" };\n`,
    },
    {
      name: "javascript: URL in a ternary branch",
      code: `export const link = (enabled, url) => (enabled ? url : "javascript:void(0)");\n`,
    },
    {
      name: "JSX href with javascript:",
      filename: "src/Comp.jsx",
      code: `export const Link = () => <a href="javascript:void(0)">Open</a>;\n`,
    },
  ],
  template: {
    valid: [
      { name: "https href", filename: FILENAME, code: vue("", `<a href="https://example.com">docs</a>`) },
      { name: "relative href and router-link", filename: FILENAME, code: vue("", `<a href="/docs">docs</a><RouterLink to="/home">home</RouterLink>`) },
      { name: "button with a click handler", filename: FILENAME, code: vue("function open() {}", `<button type="button" @click="open">open</button>`) },
      { name: "bound dynamic href without a javascript: prefix", filename: FILENAME, code: vue("defineProps(['url'])", `<a :href="url">link</a>`) },
      { name: "javascript: in text content", filename: FILENAME, code: vue("", `<p>Avoid javascript:void(0) links.</p>`) },
    ],
    invalid: [
      { name: "static javascript:void(0) href", filename: FILENAME, code: vue("", `<a href="javascript:void(0)">open</a>`) },
      { name: "static javascript: href with code", filename: FILENAME, code: vue("", `<a href="javascript:alert(1)">open</a>`) },
      { name: "bound literal javascript: href", filename: FILENAME, code: vue("", `<a :href="'javascript:void(0)'">open</a>`) },
      { name: "bound template literal with a javascript: prefix", filename: FILENAME, code: vue("defineProps(['code'])", "<a :href=\"`javascript:${code}`\">open</a>") },
      { name: "javascript: action on a form", filename: FILENAME, code: vue("", `<form action="javascript:submit()"></form>`) },
      { name: "javascript: href in a v-bind object", filename: FILENAME, code: vue("", `<a v-bind="{ href: 'javascript:void(0)' }">open</a>`) },
    ],
  },
};

export default cases;
