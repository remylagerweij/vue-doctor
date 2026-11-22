# `vue-doctor/reactivity/no-primitive-watch-source`

> Watch a getter instead of the value: `watch(() => props.count, ...)`, `watch(() => state.count, ...)`, or pass the ref itself: `watch(count, ...)`

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `off` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.5.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


::: tip Opt-in preview rule
This rule is off by default. Enable it by naming it in your config: `rules: { "vue-doctor/reactivity/no-primitive-watch-source": "warn" }` (a `/*` group key does not enable it). See [Preview rules](/guide/configuration#preview-rules).
:::

## Why it matters

Watch a getter instead of the value: `watch(() => props.count, ...)`, `watch(() => state.count, ...)`, or pass the ref itself: `watch(count, ...)`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

`watch(state.count, cb)`, `watch(props.count, cb)` and `watch(count.value, cb)` evaluate the expression once and pass its current value; when that value is a string, number, boolean, null or undefined Vue cannot track it, logs "Invalid watch source" and the callback never runs. Pass a getter (`watch(() => props.count, cb)`), the ref itself (`watch(count, cb)`), or an array of those. Only sources that are certainly primitive are reported: a `reactive({ count: 0 })` property, a prop declared as `string`/`number`/`boolean` (type-based or runtime `defineProps`, or `props: { count: Number }`), or a ref created with a primitive in the same function.

---

*Rule source: [`vue-doctor/reactivity/no-primitive-watch-source`](https://github.com/remylagerweij/vue-doctor)*
