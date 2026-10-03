## 🩺 Vue Doctor: 🟠 **50/100** (Needs work)

> **Score capped at 50** (60 before the cap) because of a high-confidence security error in `vue-doctor/security/no-eval`.

3 errors · 64 warnings

| Category | Score | Errors | Warnings |
| --- | ---: | ---: | ---: |
| Performance | 🟡 87 | 0 | 25 |
| Correctness | 🟢 91 | 2 | 14 |
| Reactivity | 🟢 93 | 0 | 11 |
| Security | 🟢 96 | 1 | 4 |
| Bundle Size | 🟢 97 | 0 | 4 |
| Ecosystem | 🟢 97 | 0 | 4 |
| Architecture | 🟢 99 | 0 | 2 |

**Biggest improvements**

- Fixing [`vue-doctor/security/no-eval`](https://remylagerweij.github.io/vue-doctor/rules/security/no-eval) gains **+11**

---

### 🔴 [`vue-doctor/correctness/no-this-in-setup`](https://remylagerweij.github.io/vue-doctor/rules/correctness/no-this-in-setup) (1)

Use refs, props and composables instead of \`this\` in \`&lt;script setup&gt;\`

- `correctness-issues.vue:8`: "this" is not available in &lt;script setup&gt; or setup\(\) — use refs and composables instead

### 🔴 [`vue-doctor/security/no-eval`](https://remylagerweij.github.io/vue-doctor/rules/security/no-eval) (1)

Replace \`eval\(\)\` with a safe alternative: \`JSON.parse\(\)\` for data, or a lookup table of functions for dynamic behaviour

- `security-issues.vue:6`: eval\(\) is a security risk — use safer alternatives

### 🔴 [`vue/require-v-for-key`](https://remylagerweij.github.io/vue-doctor/rules/correctness/vue-require-v-for-key) (1)

Add a unique \`:key\` attribute to every \`v-for\` iteration element

- `template-issues.vue:12`: Elements in iteration expect to have 'v-bind:key' directives.

### ⚠️ [`vue-doctor/correctness/no-direct-dom-manipulation`](https://remylagerweij.github.io/vue-doctor/rules/correctness/no-direct-dom-manipulation) (3)

Use template refs: \`const el = ref&lt;HTMLElement&gt;\(\)\` with \`ref="el"\` instead of \`document.querySelector\(\)\`

- `correctness-issues.vue:26`: document.querySelector\(\) — use template refs instead of direct DOM manipulation in Vue
- `js-perf-issues.ts:35`: document.createElement\(\) — use template refs instead of direct DOM manipulation in Vue
- `js-perf-issues.vue:30`: document.createElement\(\) — use template refs instead of direct DOM manipulation in Vue

### ⚠️ [`vue-doctor/correctness/prefer-defineProps-destructure`](https://remylagerweij.github.io/vue-doctor/rules/correctness/prefer-defineProps-destructure) (3)

Destructure props for reactive access: \`const { prop1, prop2 } = defineProps&lt;Props&gt;\(\)\`

- `correctness-issues.vue:20`: const props = defineProps\(\) — destructure props for reactive access: const { prop1, prop2 } = defineProps&lt;Props&gt;\(\)
- `correctness-issues.vue:23`: const p2 = defineProps\(\) — destructure props for reactive access: const { prop1, prop2 } = defineProps&lt;Props&gt;\(\)
- `reactivity-issues.vue:4`: const props = defineProps\(\) — destructure props for reactive access: const { prop1, prop2 } = defineProps&lt;Props&gt;\(\)

### ⚠️ [`vue-doctor/performance/js-tosorted-immutable`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-tosorted-immutable) (3)

Use \`array.toSorted\(\)\` \(ES2023\) instead of \`\[...array\].sort\(\)\` for cleaner immutable sorting

- `architecture-issues.vue:22`: \[...array\].sort\(\) — use array.toSorted\(\) for immutable sorting \(ES2023\)
- `js-perf-issues.ts:16`: \[...array\].sort\(\) — use array.toSorted\(\) for immutable sorting \(ES2023\)
- `js-perf-issues.vue:9`: \[...array\].sort\(\) — use array.toSorted\(\) for immutable sorting \(ES2023\)

### ⚠️ [`vue-doctor/reactivity/no-watch-for-computed`](https://remylagerweij.github.io/vue-doctor/rules/reactivity/no-watch-for-computed) (3)

Replace the watcher with a computed property: \`const value = computed\(\(\) =&gt; transform\(source\)\)\`

- `architecture-issues.vue:99`: watch\(\) that only sets a ref — replace with a computed property
- `architecture-issues.vue:103`: watch\(\) that only sets a ref — replace with a computed property

### ⚠️ [`vue-doctor/correctness/no-prevent-default`](https://remylagerweij.github.io/vue-doctor/rules/correctness/no-prevent-default) (2)

Use Vue's \`.prevent\` modifier: \`@​submit.prevent\` instead of calling \`event.preventDefault\(\)\`

- `architecture-issues.vue:71`: event.preventDefault\(\) — use Vue's .prevent modifier \(@​submit.prevent\) for cleaner code
- `correctness-issues.vue:33`: event.preventDefault\(\) — use Vue's .prevent modifier \(@​submit.prevent\) for cleaner code

### ⚠️ [`vue-doctor/correctness/require-defineprops-types`](https://remylagerweij.github.io/vue-doctor/rules/correctness/require-defineprops-types) (2)

Declare props with a type argument: \`defineProps&lt;{ title: string }&gt;\(\)\`

- `correctness-issues.vue:20`: defineProps\(\) without type parameter — use defineProps&lt;{ prop: Type }&gt;\(\) for type safety
- `correctness-issues.vue:23`: defineProps\(\) without type parameter — use defineProps&lt;{ prop: Type }&gt;\(\) for type safety

### ⚠️ [`vue-doctor/performance/js-cache-storage`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-cache-storage) (2)

Cache \`localStorage.getItem\(\)\` result in a variable to avoid redundant reads

- `js-perf-issues.ts:50`: localStorage.getItem\("key"\) called multiple times — cache the result in a variable
- `js-perf-issues.vue:27`: localStorage.getItem\("token"\) called multiple times — cache the result in a variable

### ⚠️ [`vue-doctor/performance/js-combine-iterations`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-combine-iterations) (2)

Combine chained \`.map\(\).filter\(\)\` into a single \`.reduce\(\)\` or \`for...of\` loop

- `js-perf-issues.ts:10`: .filter\(\).map\(\) iterates the array twice — combine into a single loop with .reduce\(\) or for...of
- `js-perf-issues.vue:6`: .filter\(\).map\(\) iterates the array twice — combine into a single loop with .reduce\(\) or for...of

### ⚠️ [`vue-doctor/performance/js-early-exit`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-early-exit) (2)

Use early returns to flatten deeply nested conditions for better readability

- `js-perf-issues.ts:55`: 4 levels of nested if statements — use early returns to flatten
- `js-perf-issues.vue:13`: 4 levels of nested if statements — use early returns to flatten

### ⚠️ [`vue-doctor/performance/js-min-max-loop`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-min-max-loop) (2)

Use \`Math.min\(...array\)\` or \`Math.max\(...array\)\` — O\(n\) instead of O\(n log n\) with sort

- `js-perf-issues.ts:25`: array.sort\(\)\[0\] for min/max — use Math.min\(...array\) instead \(O\(n\) vs O\(n log n\)\)
- `js-perf-issues.ts:26`: array.sort\(\)\[length-1\] for min/max — use Math.max\(...array\) instead \(O\(n\) vs O\(n log n\)\)

### ⚠️ [`vue-doctor/performance/no-deep-watch`](https://remylagerweij.github.io/vue-doctor/rules/performance/no-deep-watch) (2)

Watch the specific properties you need \(\`\(\) =&gt; state.user.name\`\) or use \`watchEffect\(\)\` instead of \`{ deep: true }\`

- `ecosystem-issues.vue:17`: watch\(\) with { deep: true } traverses the entire object tree on every change — watch specific properties or use watchEffect\(\)
- `performance-issues.vue:30`: watch\(\) with { deep: true } traverses the entire object tree on every change — watch specific properties or use watchEffect\(\)

### ⚠️ [`vue-doctor/architecture/no-giant-component`](https://remylagerweij.github.io/vue-doctor/rules/architecture/no-giant-component) (1)

Extract logical sections into focused components or composables

- `architecture-issues.vue:4`: Component has 405+ lines — consider extracting logic into composables or child components

### ⚠️ [`vue-doctor/bundle-size/no-barrel-import`](https://remylagerweij.github.io/vue-doctor/rules/bundle-size/no-barrel-import) (1)

Import from the direct path: \`import { Button } from './components/Button'\` instead of \`./components\`

- `bundle-issues.vue:14`: Barrel import from "./components/index" — import directly from the source file to improve tree-shaking

### ⚠️ [`vue-doctor/bundle-size/no-full-lodash-import`](https://remylagerweij.github.io/vue-doctor/rules/bundle-size/no-full-lodash-import) (1)

Import the specific function: \`import debounce from 'lodash/debounce'\` — saves \~70kb

- `bundle-issues.vue:5`: Full lodash import adds \~70kb — import specific function: import debounce from "lodash/debounce"

### ⚠️ [`vue-doctor/bundle-size/no-moment`](https://remylagerweij.github.io/vue-doctor/rules/bundle-size/no-moment) (1)

Replace with \`import { format } from 'date-fns'\` \(tree-shakeable\) or \`import dayjs from 'dayjs'\` \(2kb\)

- `bundle-issues.vue:8`: moment.js is 330kb+ — use date-fns \(tree-shakeable\) or dayjs \(2kb\) instead

### ⚠️ [`vue-doctor/bundle-size/prefer-dynamic-import`](https://remylagerweij.github.io/vue-doctor/rules/bundle-size/prefer-dynamic-import) (1)

Use \`defineAsyncComponent\(\(\) =&gt; import\('./HeavyComponent.vue'\)\)\` for heavy components

- `bundle-issues.vue:11`: Static import of heavy library "@​monaco-editor/react" — use defineAsyncComponent\(\(\) =&gt; import\('@​monaco-editor/react'\)\) to lazy load

### ⚠️ [`vue-doctor/correctness/no-array-index-as-key`](https://remylagerweij.github.io/vue-doctor/rules/correctness/no-array-index-as-key) (1)

Use a stable unique identifier: \`:key="item.id"\` — index keys break on reorder/filter

- `correctness-issues.vue:39`: Avoid using array index "index" as key — use unique IDs for stable rendering

### ⚠️ [`vue-doctor/ecosystem/pinia-no-destructure`](https://remylagerweij.github.io/vue-doctor/rules/ecosystem/pinia-no-destructure) (1)

Directly destructuring a Pinia store breaks reactivity. Use \`storeToRefs\` instead.

- `ecosystem-issues.vue:11`: Directly destructuring a Pinia store breaks reactivity. Use \`storeToRefs\` instead \(e.g., \`const { count } = storeToRefs\(useMyStore\(\)\)\`\).

### ⚠️ [`vue-doctor/ecosystem/pinia-no-watch-store`](https://remylagerweij.github.io/vue-doctor/rules/ecosystem/pinia-no-watch-store) (1)

Use \`&lt;store&gt;.\$subscribe\(\)\` or watch specific primitive getters instead of deep watching the entire store.

- `ecosystem-issues.vue:17`: Watching an entire Pinia store object is extremely expensive. Use \`&lt;store&gt;.\$subscribe\(\)\` or watch specific primitive getters instead.

### ⚠️ [`vue-doctor/ecosystem/router-no-async-guard-without-next`](https://remylagerweij.github.io/vue-doctor/rules/ecosystem/router-no-async-guard-without-next) (1)

An async beforeEach/beforeResolve guard that declares \`next\` must call it, otherwise navigation never resolves. Prefer returning a value and dropping \`next\`.

- `ecosystem-issues.vue:39`: This async beforeEach guard declares \`next\` but never calls it, so navigation never resolves. Call \`next\(\)\` or drop the parameter and return a value.

### ⚠️ [`vue-doctor/ecosystem/router-no-string-push`](https://remylagerweij.github.io/vue-doctor/rules/ecosystem/router-no-string-push) (1)

Pass a route object \(e.g. \`{ name: 'user', params: { id } }\`\) instead of a path built with string interpolation to router.push/replace.

- `ecosystem-issues.vue:30`: Do not build a route path by string interpolation: params are not encoded and the route cannot be refactored. Pass a route object instead \(e.g. \`{ name: 'user', params: { id } }\`\).

### ⚠️ [`vue-doctor/performance/async-parallel`](https://remylagerweij.github.io/vue-doctor/rules/performance/async-parallel) (1)

Use \`const \[a, b\] = await Promise.all\(\[fetchA\(\), fetchB\(\)\]\)\` to run independent operations concurrently

- `js-perf-issues.ts:3`: 3 sequential await statements that appear independent — use Promise.all\(\) for parallel execution

### ⚠️ [`vue-doctor/performance/client-passive-event-listeners`](https://remylagerweij.github.io/vue-doctor/rules/performance/client-passive-event-listeners) (1)

Add \`{ passive: true }\` as the third argument: \`addEventListener\('scroll', handler, { passive: true }\)\`

- `performance-issues.vue:23`: addEventListener\("scroll"\) without { passive: true } — blocks scrolling performance

### ⚠️ [`vue-doctor/performance/js-batch-dom-css`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-batch-dom-css) (1)

Batch style changes with \`el.style.cssText\` or \`el.classList.add\(\)\` to avoid multiple reflows

- `js-perf-issues.ts:37`: Multiple sequential element.style assignments — batch with cssText or classList for fewer reflows

### ⚠️ [`vue-doctor/performance/js-hoist-regexp`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-hoist-regexp) (1)

Hoist \`new RegExp\(\)\` to a module-level constant to avoid re-compilation on every iteration

- `js-perf-issues.ts:20`: new RegExp\(\) inside a loop — hoist to a module-level constant

### ⚠️ [`vue-doctor/performance/js-index-maps`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-index-maps) (1)

Build a \`Map\` indexed by the search key before the loop for O\(1\) lookups

- `js-perf-issues.ts:44`: array.find\(\) in a loop is O\(n\*m\) — build a Map for O\(1\) lookups

### ⚠️ [`vue-doctor/performance/js-set-map-lookups`](https://remylagerweij.github.io/vue-doctor/rules/performance/js-set-map-lookups) (1)

Convert the array to a \`Set\` before the loop for O\(1\) lookups instead of O\(n\)

- `js-perf-issues.ts:30`: array.includes\(\) in a loop is O\(n\) per call — convert to a Set for O\(1\) lookups

### ⚠️ [`vue-doctor/performance/no-global-css-variable-animation`](https://remylagerweij.github.io/vue-doctor/rules/performance/no-global-css-variable-animation) (1)

Set the variable on the nearest element instead of a parent, or use \`@​property\` with \`inherits: false\`

- `performance-issues.vue:6`: Setting CSS variables directly via DOM API can cause expensive repaints \(especially in animation loops\) — use Vue reactive :style bindings instead

### ⚠️ [`vue-doctor/performance/no-large-animated-blur`](https://remylagerweij.github.io/vue-doctor/rules/performance/no-large-animated-blur) (1)

Keep blur radius under 10px, or apply blur to a smaller element

- `performance-issues.vue:13`: blur\(20px\) is expensive to animate — keep under 10px or apply to a smaller element

### ⚠️ [`vue-doctor/performance/no-layout-property-animation`](https://remylagerweij.github.io/vue-doctor/rules/performance/no-layout-property-animation) (1)

Use \`transform: translateX\(\)\` or \`scale\(\)\` instead — they run on the compositor and skip layout/paint

- `performance-issues.vue:19`: Animating layout property "left" causes expensive reflows — use transform or opacity instead

### ⚠️ [`vue-doctor/performance/no-permanent-will-change`](https://remylagerweij.github.io/vue-doctor/rules/performance/no-permanent-will-change) (1)

Add will-change on animation start and remove on end. Permanent promotion wastes GPU memory

- `performance-issues.vue:14`: Permanent will-change wastes GPU memory — add on animation start and remove on end

### ⚠️ [`vue-doctor/performance/no-scale-from-zero`](https://remylagerweij.github.io/vue-doctor/rules/performance/no-scale-from-zero) (1)

Use \`initial={{ scale: 0.95, opacity: 0 }}\` — elements should deflate like a balloon, not vanish into a point

- `performance-issues.vue:12`: Scaling from 0 creates a jarring pop-in effect — use scale\(0.95\) with opacity for a smooth entrance

### ⚠️ [`vue-doctor/performance/no-transition-all`](https://remylagerweij.github.io/vue-doctor/rules/performance/no-transition-all) (1)

List specific properties: \`transition: "opacity 200ms, transform 200ms"\` — or in Tailwind use \`transition-colors\`, \`transition-opacity\`, or \`transition-transform\`

- `performance-issues.vue:11`: transition: "all" animates every CSS property — list specific properties instead

_… and 17 more findings not shown. Use `--format json` for the complete list._
