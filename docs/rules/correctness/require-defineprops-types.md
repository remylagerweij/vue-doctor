# `vue-doctor/correctness/require-defineprops-types`

> Declare props with a type argument: `defineProps<{ title: string }>()`

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Declare props with a type argument: `defineProps<{ title: string }>()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Declare props with a type argument, for example `defineProps<{ title: string; count?: number }>()`, instead of an untyped call or a string array.

---

*Rule source: [`vue-doctor/correctness/require-defineprops-types`](https://github.com/remylagerweij/vue-doctor)*
