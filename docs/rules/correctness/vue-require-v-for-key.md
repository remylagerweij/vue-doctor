# `vue/require-v-for-key`

> Add a unique `:key` attribute to every `v-for` iteration element

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `error` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Add a unique `:key` attribute to every `v-for` iteration element

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Add a unique, stable `:key` to the element that has `v-for` (an id from the data, not the index).

---

*Rule source: [`vue/require-v-for-key`](https://github.com/remylagerweij/vue-doctor)*
