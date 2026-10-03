# `vue-doctor/correctness/require-emits-declaration`

> Declare events with `const emit = defineEmits<{ change: [value: string] }>()` and call `emit('change', value)` instead of `$emit`

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Declare events with `const emit = defineEmits<{ change: [value: string] }>()` and call `emit('change', value)` instead of `$emit`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Declare events with `const emit = defineEmits<{ change: [value: string] }>()` and call `emit('change', value)` instead of `$emit`.

---

*Rule source: [`vue-doctor/correctness/require-emits-declaration`](https://github.com/remylagerweij/vue-doctor)*
