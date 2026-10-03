# `vue/no-async-in-computed-properties`

> Use `watchEffect` or an async composable instead of async computed

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `watchEffect` or an async composable instead of async computed

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Computed properties cannot be async. Use `watch`/`watchEffect` with a ref, or an async composable, and expose the result.

---

*Rule source: [`vue/no-async-in-computed-properties`](https://github.com/remylagerweij/vue-doctor)*
