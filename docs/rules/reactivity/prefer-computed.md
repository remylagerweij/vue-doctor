# `vue-doctor/reactivity/prefer-computed`

> Use `const value = computed(() => expression)` instead of a watcher that only sets a ref

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `const value = computed(() => expression)` instead of a watcher that only sets a ref

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace the watcher that only assigns a ref with a `computed` that returns the same expression. Remove the now unused ref and its initial value.

---

*Rule source: [`vue-doctor/reactivity/prefer-computed`](https://github.com/remylagerweij/vue-doctor)*
