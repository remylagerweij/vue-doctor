# `vue/require-explicit-emits`

> Define emits with `defineEmits()` for better documentation and type checking

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Define emits with `defineEmits()` for better documentation and type checking

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Declare every emitted event in `defineEmits()` (or the `emits` option) and use those names when emitting.

---

*Rule source: [`vue/require-explicit-emits`](https://github.com/remylagerweij/vue-doctor)*
