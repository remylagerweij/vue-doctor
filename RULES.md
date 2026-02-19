# Vue Doctor Rules

This document provides a detailed explanation of all rules checked by Vue Doctor.

## Table of Contents

- [Reactivity](#reactivity)
- [Performance](#performance)
- [Security](#security)
- [Architecture](#architecture)
- [Correctness](#correctness)
- [Nuxt](#nuxt)
- [Bundle Size](#bundle-size)
- [Server](#server)

---

## Reactivity

### `no-deep-watch`
**Severity**: ⚠️ Warning

**Why?**: Watching an object with `{ deep: true }` forces Vue to traverse the entire object tree recursively on every property change. For large objects, this causes significant performance frame drops.

**❌ Bad**:
```ts
watch(bigObject, cb, { deep: true })
```

**✅ Good**:
```ts
watch(() => bigObject.specificID, cb)
```

### `no-fetch-in-watch`
**Severity**: ⚠️ Warning

**Why?**: Triggering a `fetch()` call inside a watcher can lead to race conditions (waterfalls) and unnecessary network requests if the watcher triggers frequently.

**❌ Bad**:
```ts
watch(id, async (newId) => {
  const data = await fetch(`/api/${newId}`);
})
```

**✅ Good**:
Use a data fetching library or composable that handles cancellation and loading states.
```ts
const { data } = useFetch(() => `/api/${id.value}`)
```

### `no-mutation-in-computed`
**Severity**: 🔴 Error

**Why?**: Computed properties should be pure functions that derive state. Mutating state (side effects) inside a computed property makes the data flow unpredictable and hard to debug.

**❌ Bad**:
```ts
const double = computed(() => {
  count.value++; // Side effect!
  return count.value * 2;
})
```

**✅ Good**:
Perform side effects in a watcher or event handler.

### `no-reactive-destructure`
**Severity**: ⚠️ Warning

**Why?**: Destructuring a `reactive()` object loses reactivity for the destructured properties. They become plain values and won't update the UI.

**❌ Bad**:
```ts
const state = reactive({ count: 0 });
const { count } = state; // 'count' is now just a number, not reactive
```

**✅ Good**:
Use `toRefs()` to keep reactivity.
```ts
const { count } = toRefs(state);
```

---

## Performance

### `no-layout-property-animation`
**Severity**: ⚠️ Warning

**Why?**: Animating layout properties like `width`, `height`, `margin`, `padding`, `top`, `left` triggers the browser's layout engine on every frame ("reflow"). This is expensive and causes jank.

**❌ Bad**:
```css
.card {
  transition: width 0.3s;
}
```

**✅ Good**:
Animate `transform` (scale) or `opacity` instead. These are handled by the GPU (compositor thread).
```css
.card {
  transition: transform 0.3s;
}
```

### `no-transition-all`
**Severity**: ⚠️ Warning

**Why?**: `transition: all` forces the browser to check *every* potential CSS property for changes, which can be slow. It can also accidentally animate properties you didn't intend to.

**❌ Bad**:
```css
.btn {
  transition: all 0.2s;
}
```

**✅ Good**:
List specific properties.
```css
.btn {
  transition: opacity 0.2s, background-color 0.2s;
}
```

---

## Security

### `no-secrets-in-client-code`
**Severity**: 🔴 Error

**Why?**: Any code shipped to the client is public. Including API keys, tokens, or passwords in client-side code exposes them to attackers.

**❌ Bad**:
```ts
const API_KEY = "sk_live_12345";
```

**✅ Good**:
Use environment variables prefixed with `VITE_` or `NUXT_PUBLIC_`, but *never* for secrets. Secrets should stay on the server.

### `no-v-html`
**Severity**: ⚠️ Warning

**Why?**: `v-html` renders raw HTML, which exposes your application to Cross-Site Scripting (XSS) if the content comes from an untrusted source (like user input).

**❌ Bad**:
```vue
<div v-html="userComment"></div>
```

**✅ Good**:
Use text interpolation (`{{ }}`) or a sanitization library like DOMPurify.

---

## Architecture

### `no-giant-component`
**Severity**: ⚠️ Warning

**Why?**: Components with more than 500 lines of code are hard to read, maintain, and test.

**✅ Good**:
Break down the component into smaller sub-components or extract logic into composables.

---

## Correctness

### `no-this-in-setup`
**Severity**: 🔴 Error

**Why?**: `this` is not available in `<script setup>`. It will be `undefined`.

**❌ Bad**:
```vue
<script setup>
console.log(this.$router);
</script>
```

**✅ Good**:
Use composables (e.g., `useRouter()`) or props/emit directly.

### `require-defineprops-types`
**Severity**: ⚠️ Warning

**Why?**: Using `defineProps()` without type arguments in TypeScript means your props are `any`, losing type safety.

**❌ Bad**:
```ts
const props = defineProps(['id']);
```

**✅ Good**:
```ts
const props = defineProps<{ id: string }>();
```

---

## Nuxt

### `nuxt-no-window-in-ssr`
**Severity**: 🔴 Error

**Why?**: `window`, `document`, and other browser globals are not defined during Server-Side Rendering (SSR). Accessing them will crash your app on the server.

**❌ Bad**:
```ts
if (window.innerWidth > 768) { ... }
```

**✅ Good**:
Wrap in `onMounted` or check `import.meta.client`.
```ts
onMounted(() => {
  if (window.innerWidth > 768) { ... }
})
```

### `nuxt-require-seo-meta`
**Severity**: ⚠️ Warning

**Why?**: `useHead({ meta: [...] })` is not type-safe and prone to typos. `useSeoMeta` provides full type support for standard meta tags.

**❌ Bad**:
```ts
useHead({
  meta: [{ name: 'description', content: 'My App' }]
})
```

**✅ Good**:
```ts
useSeoMeta({
  description: 'My App'
})
```
