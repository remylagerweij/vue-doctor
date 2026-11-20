# `vue-doctor/reactivity/no-reactive-spread-return`

> Return `...toRefs(state)` (or the reactive object itself) instead of spreading the reactive object

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
This rule is off by default. Enable it by naming it in your config: `rules: { "vue-doctor/reactivity/no-reactive-spread-return": "warn" }` (a `/*` group key does not enable it). See [Preview rules](/guide/configuration#preview-rules).
:::

## Why it matters

Return `...toRefs(state)` (or the reactive object itself) instead of spreading the reactive object

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

`return { ...state }` from `setup()`, a composable (`useX`) or a Pinia setup store copies the current values of a `reactive()` object into a plain object: the template or caller sees a snapshot that never updates, and a Pinia store treats the copies as non-state. Return `{ ...toRefs(state), other }` so every property stays a ref linked to the reactive object, or return `state` itself and let callers read `state.prop`. Spreading a reactive object anywhere else (building a request payload, cloning) is an intentional snapshot and is not reported.

---

*Rule source: [`vue-doctor/reactivity/no-reactive-spread-return`](https://github.com/remylagerweij/vue-doctor)*
