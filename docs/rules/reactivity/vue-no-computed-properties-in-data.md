# `vue/no-computed-properties-in-data`

> Move the reference into `computed` or `setup()` instead of `data()`

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

Move the reference into `computed` or `setup()` instead of `data()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not reference computed properties from `data()`; they are not ready yet. Derive the value inside a `computed` or `setup()` instead.

---

*Rule source: [`vue/no-computed-properties-in-data`](https://github.com/remylagerweij/vue-doctor)*
