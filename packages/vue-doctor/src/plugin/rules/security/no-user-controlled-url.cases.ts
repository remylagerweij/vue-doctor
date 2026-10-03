import type { RuleCases } from "../../rule-cases.js";

const vue = (script: string, template: string): string =>
  `${script ? `<script setup>\n${script}\n</script>\n` : ""}<template>\n${template}\n</template>\n`;

const FILENAME = "src/Comp.vue";

const cases: RuleCases = {
  valid: [
    {
      name: "navigation to a literal URL",
      code: `export const go = () => { window.location.href = "/dashboard"; window.open("https://example.com", "_blank"); };\n`,
    },
    {
      name: "query value validated with new URL before navigating",
      code: `import { useRoute } from "vue-router";\nexport const useNext = () => {\n  const route = useRoute();\n  const next = route.query.next;\n  const target = new URL(next, location.origin);\n  if (target.origin === location.origin) location.href = next;\n};\n`,
    },
    {
      name: "query value passed through a URL sanitizer",
      code: `import { sanitizeUrl } from "@braintree/sanitize-url";\nexport const go = (route) => { const next = route.query.next; location.href = sanitizeUrl(next); };\n`,
    },
    {
      name: "query value placed after a relative path prefix",
      code: "export const search = (route) => { location.href = `/search?q=${route.query.q}`; };\n",
    },
    {
      name: "location.hash assigned as is (starts with #)",
      code: `export const scroll = () => { location.href = location.hash; };\n`,
    },
    {
      name: "value that is not user input",
      code: `export const go = (props) => { window.open(props.url); location.assign(config.loginUrl); };\n`,
    },
    {
      name: "query value prefix-checked as a path",
      code: `export const go = (route) => {\n  const next = route.query.next;\n  if (next.startsWith("/") && !next.startsWith("//")) location.href = next;\n};\n`,
    },
  ],
  invalid: [
    {
      name: "location.href from a route query",
      code: `export const go = (route) => { location.href = route.query.redirect; };\n`,
    },
    {
      name: "window.open with a route param",
      code: `export const open = (route) => { window.open(route.params.url, "_blank"); };\n`,
    },
    {
      name: "location.assign with a value read from useRoute",
      code: `import { useRoute } from "vue-router";\nexport const go = () => { const route = useRoute(); const next = route.query.next; location.assign(next); };\n`,
    },
    {
      name: "location.replace with a stripped hash",
      code: `export const go = () => { location.replace(decodeURIComponent(location.hash.slice(1))); };\n`,
    },
    {
      name: "href from URLSearchParams",
      code: `export const link = (a) => { const params = new URLSearchParams(location.search); a.href = params.get("url"); };\n`,
    },
    {
      name: "destructured query value assigned to href",
      code: `export const link = (route, a) => { const { next } = route.query; a.href = next; };\n`,
    },
    {
      name: "iframe src from a computed query value",
      code: `import { computed } from "vue";\nexport const useFrame = (route, frame) => {\n  const src = computed(() => route.query.src);\n  frame.src = src.value;\n};\n`,
    },
    {
      name: "location set to window.name",
      code: `export const go = () => { window.location = window.name; };\n`,
    },
  ],
  template: {
    valid: [
      { name: "router-link with a query value", filename: FILENAME, code: vue("", `<RouterLink :to="$route.query.next">next</RouterLink>`) },
      { name: "href with a relative prefix", filename: FILENAME, code: vue("", "<a :href=\"`/search?q=${$route.query.q}`\">search</a>") },
      { name: "href bound to a prop", filename: FILENAME, code: vue("defineProps(['url'])", `<a :href="url">link</a>`) },
      { name: "route query used as text and as a class", filename: FILENAME, code: vue("", `<p :class="$route.query.theme">{{ $route.query.next }}</p>`) },
      { name: "sanitized route query", filename: FILENAME, code: vue("import { sanitizeUrl } from '@braintree/sanitize-url'", `<a :href="sanitizeUrl($route.query.next)">next</a>`) },
    ],
    invalid: [
      { name: "href from a route query", filename: FILENAME, code: vue("", `<a :href="$route.query.next">next</a>`) },
      { name: "href from a route param", filename: FILENAME, code: vue("", `<a :href="route.params.url">open</a>`) },
      { name: "src from a query with a fallback", filename: FILENAME, code: vue("", `<iframe :src="$route.query.src || '/default'"></iframe>`) },
      { name: "formaction from a decoded query", filename: FILENAME, code: vue("", `<button :formaction="decodeURIComponent($route.query.to)">go</button>`) },
      { name: "href in a v-bind object", filename: FILENAME, code: vue("", `<a v-bind="{ href: $route.query.next }">next</a>`) },
    ],
  },
};

export default cases;
