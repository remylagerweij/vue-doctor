import type { SourceInput, TreeInput } from "./types.js";

// Synthetic inputs that grow along one axis (nesting depth, length, count) to expose rules whose
// cost is super-linear in it, and payloads built to trigger catastrophic regex backtracking.
// Deterministic: sizes only depend on `scale` (1 for the full run, smaller for the smoke run).

const sized = (base: number, scale: number): number => Math.max(8, Math.round(base * scale));

const script = (name: string, code: string, filename = "src/stress.ts"): SourceInput => ({
  id: `stress:${name}`,
  origin: "stress",
  filename,
  code,
});

const repeatLines = (count: number, line: (index: number) => string): string =>
  Array.from({ length: count }, (_unused, index) => line(index)).join("\n");

/** Strings that make backtracking regexes blow up: long runs of one character class. */
const REDOS_PAYLOADS: Record<string, (size: number) => string> = {
  "letters": (size) => "a".repeat(size),
  "spaces": (size) => " ".repeat(size),
  "slashes": (size) => "/".repeat(size),
  "dots": (size) => ".".repeat(size),
  "dashes": (size) => "-".repeat(size),
  "underscores": (size) => "_".repeat(size),
  "equals": (size) => "=".repeat(size),
  "dotted-words": (size) => "a.".repeat(size / 2),
  "key-values": (size) => "k=v&".repeat(size / 4),
  "at-signs": (size) => "a@".repeat(size / 2),
  "url-labels": (size) => `https://${"a.".repeat(size / 2)}`,
  "bearer": (size) => `Bearer ${"a".repeat(size)}`,
  "jwt-like": (size) => `eyJ${"a".repeat(size)}.${"b".repeat(size)}.${"c".repeat(size)}`,
  "live-key": (size) => `sk_live_${"a".repeat(size)}`,
  "hex": (size) => `0x${"f".repeat(size)}`,
  "base64": (size) => `${"QUJD".repeat(size / 4)}==`,
  "word-spaces": (size) => "ab ".repeat(size / 3),
  "tags": (size) => "<".repeat(size),
  "backslashes": (size) => "\\\\".repeat(size / 2),
  "digits": (size) => "1".repeat(size),
  "unicode": (size) => "é".repeat(size),
  "newlines-escaped": (size) => "\\n".repeat(size / 2),
};

/** A script that uses the payload at the places rules inspect string values. */
const payloadScript = (payload: string): string =>
  [
    `const a = "${payload}";`,
    `const apiKey = "${payload}";`,
    `const password = "${payload}";`,
    `fetch("${payload}");`,
    `fetch(\`${payload}\${a}\`);`,
    `window.location.href = "${payload}";`,
    `el.innerHTML = "${payload}";`,
    `new RegExp("${payload}");`,
    `localStorage.setItem("token", "${payload}");`,
    `import("${payload}");`,
    `eval("${payload}");`,
    `const headers = { Authorization: "Bearer ${payload}", "x-api-key": "${payload}" };`,
    `window.addEventListener("message", () => {});`,
    `window.postMessage("${payload}", "${payload}");`,
    `const url = new URL("${payload}");`,
    `export default defineEventHandler(() => ({ path: "${payload}" }));`,
  ].join("\n");

export const buildStressInputs = (scale: number): SourceInput[] => {
  const depth = sized(250, scale);
  const length = sized(3000, scale);
  const inputs: SourceInput[] = [
    script("deep-parens", `export const value = ${"(".repeat(depth)}1${")".repeat(depth)};\n`),
    script("deep-calls", `export const value = ${"f(".repeat(depth)}1${")".repeat(depth)};\n`),
    script("deep-blocks", `${"if (a) {\n".repeat(depth)}run();\n${"}\n".repeat(depth)}`),
    script("deep-arrows", `export const value = ${"() => ".repeat(depth)}1;\n`),
    script("deep-ternary", `export const value = ${"a ? 1 : ".repeat(depth)}2;\n`),
    script("long-member-chain", `export const value = a${Array.from({ length: sized(1000, scale) }, (_unused, index) => `.p${index}`).join("")};\n`),
    script("long-call-chain", `export const value = x${".m()".repeat(sized(800, scale))};\n`),
    // 3000 terms is past what oxlint's own JS plugin host can walk (it fails near 2800 levels); kept so the crash stays visible and allowlisted.
    script("long-binary", `export const value = ${Array.from({ length: sized(3000, scale) }, (_unused, index) => `"s${index}"`).join(" + ")};\n`),
    script(
      "many-statements",
      `import { ref, watch } from "vue";\n${repeatLines(length, (index) => `const v${index} = ref(${index});\nwatch(v${index}, () => { fetch("/api/${index}"); });`)}\n`,
    ),
    script(
      "many-functions",
      repeatLines(sized(1500, scale), (index) => `export function fn${index}(arg) {\n  const data = useFetch("/api/${index}");\n  watch(() => arg, () => data.refresh());\n  return data;\n}`),
    ),
    script("many-imports", repeatLines(length, (index) => `import m${index} from "pkg-${index}";`) + "\n"),
    script("big-array", `export const list = [${Array.from({ length: sized(20000, scale) }, (_unused, index) => index).join(", ")}];\n`),
    script("big-object", `export const map = {\n${repeatLines(sized(5000, scale), (index) => `  key${index}: ${index},`)}\n};\n`),
    script("long-string", `export const text = "${"a".repeat(sized(300_000, scale))}";\n`),
    script("long-line", `${"run();".repeat(sized(20000, scale))}\n`),
    script("many-classes", repeatLines(sized(800, scale), (index) => `class C${index} { m() { return this.x; } }`) + "\n"),
    script(
      "many-event-listeners",
      repeatLines(length, (index) => `window.addEventListener("message", (event) => { handle${index}(event.data); });`) + "\n",
    ),
    script(
      "vue-many-refs",
      `<script setup>\nimport { ref, computed, watch } from "vue";\n${repeatLines(sized(400, scale), (index) => `const r${index} = ref(${index});\nconst c${index} = computed(() => r${index}.value * 2);\nwatch(r${index}, () => {});`)}\n</script>\n<template>\n  <div>{{ r0 }}</div>\n</template>\n`,
      "src/StressRefs.vue",
    ),
    script(
      "vue-many-elements",
      `<script setup>\nconst items = [];\nfunction go() {}\n</script>\n<template>\n  <ul>\n${repeatLines(length, (index) => `    <li v-for="item in items" :key="item.id" @click="go(item)">{{ item.name }} ${index}</li>`)}\n  </ul>\n</template>\n`,
      "src/StressElements.vue",
    ),
    script(
      "vue-deep-template",
      `<template>\n${"<div>".repeat(sized(300, scale))}x${"</div>".repeat(sized(300, scale))}\n</template>\n`,
      "src/StressDeep.vue",
    ),
    script(
      "vue-many-attributes",
      `<template>\n  <div ${Array.from({ length: sized(2000, scale) }, (_unused, index) => `data-a${index}="${index}"`).join(" ")} />\n</template>\n`,
      "src/StressAttributes.vue",
    ),
    script(
      "vue-long-expression",
      `<script setup>\nconst a = 1;\n</script>\n<template>\n  <p>{{ ${Array.from({ length }, () => "a").join(" + ")} }}</p>\n</template>\n`,
      "src/StressExpression.vue",
    ),
    script(
      "vue-many-slots",
      `<template>\n  <Comp>\n${repeatLines(sized(1500, scale), (index) => `    <template #s${index}="{ item }"><span :title="item.t${index}">{{ item }}</span></template>`)}\n  </Comp>\n</template>\n`,
      "src/StressSlots.vue",
    ),
  ];

  const payloadSize = sized(20000, scale);
  for (const [name, build] of Object.entries(REDOS_PAYLOADS)) {
    inputs.push(script(`redos:${name}`, `${payloadScript(build(payloadSize))}\n`));
  }
  inputs.push(
    script(
      "redos:vue-template",
      `<template>\n  <a :href="'${"a.".repeat(payloadSize / 2)}'" target="_blank" v-html="'${"<".repeat(payloadSize)}'">${"a ".repeat(payloadSize / 2)}</a>\n</template>\n`,
      "src/StressRedos.vue",
    ),
  );
  return inputs;
};

const tree = (name: string, files: Record<string, string>, extra: Partial<TreeInput> = {}): TreeInput => ({
  id: `stress-tree:${name}`,
  origin: "stress",
  files,
  ...extra,
});

export const buildStressTrees = (scale: number): TreeInput[] => {
  const count = sized(5000, scale);
  const size = sized(20000, scale);
  const packageJson = (dependencies: Record<string, string>, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ name: "stress", version: "1.0.0", dependencies, ...extra }, null, 2);
  const manyDependencies = Object.fromEntries(Array.from({ length: count }, (_unused, index) => [`pkg-${index}`, `^1.${index}.0`]));
  return [
    tree("env-many-lines", { ".env": repeatLines(count * 4, (index) => `KEY_${index}=value-${index}`), "package.json": packageJson({}) }, { ignored: [] }),
    tree("env-long-values", {
      ".env": `API_KEY=${"a".repeat(size)}\nSECRET=${"=".repeat(size)}\nTOKEN="${"x ".repeat(size / 2)}"\n`,
      ".env.local": `PUBLIC_KEY=${"AKIA".repeat(size / 4)}\n`,
      "package.json": packageJson({}),
    }),
    tree("package-many-dependencies", {
      "package.json": packageJson(manyDependencies, { scripts: { postinstall: "node a.js", prepare: "x" } }),
      "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: Object.fromEntries(Object.keys(manyDependencies).map((name) => [`node_modules/${name}`, { version: "1.0.0", resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`, integrity: `sha512-${"a".repeat(86)}==` }])) }),
    }),
    tree("package-remote-specs", {
      "package.json": packageJson(
        Object.fromEntries(Array.from({ length: count }, (_unused, index) => [`pkg-${index}`, index % 2 ? `git+https://example.com/${"a".repeat(50)}.git#${index}` : `https://example.com/${index}.tgz`])),
      ),
    }),
    tree("package-long-strings", {
      "package.json": packageJson({ dep: `https://${"a.".repeat(size / 2)}`, other: "x".repeat(size) }, { scripts: { postinstall: "a ".repeat(size / 2) } }),
    }),
    tree("yarn-lock-large", {
      "package.json": packageJson({ a: "^1.0.0" }),
      "yarn.lock": repeatLines(count, (index) => `"pkg-${index}@^1.0.0":\n  version "1.0.0"\n  resolved "http://registry.example.com/pkg-${index}/-/pkg-${index}-1.0.0.tgz#${"a".repeat(40)}"\n  integrity sha512-${"a".repeat(86)}==\n`),
    }),
    tree("pnpm-lock-large", {
      "package.json": packageJson({ a: "^1.0.0" }),
      "pnpm-lock.yaml": `lockfileVersion: '9.0'\npackages:\n${repeatLines(count, (index) => `  pkg-${index}@1.0.0:\n    resolution: {integrity: sha512-${"a".repeat(86)}==, tarball: http://example.com/${index}.tgz}`)}\n`,
    }),
    tree(
      "public-many-files",
      Object.fromEntries([
        ["nuxt.config.ts", "export default defineNuxtConfig({});\n"],
        ...Array.from({ length: count }, (_unused, index): [string, string] => [`public/files/f${index}.json`, "{}"]),
        ["public/.env", "SECRET=1\n"],
        ["public/id_rsa", "-----BEGIN PRIVATE KEY-----\n"],
      ]),
      { framework: "nuxt" },
    ),
  ];
};
