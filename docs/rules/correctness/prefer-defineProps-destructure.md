# `vue-doctor/correctness/prefer-defineProps-destructure`

> Destructure props for reactive access: `const { prop1, prop2 } = defineProps<Props>()`

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

Destructure props for reactive access: `const { prop1, prop2 } = defineProps<Props>()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Use reactive props destructure: `const { a, b = 1 } = defineProps<Props>()`, which stays reactive in Vue 3.5+. Check the project's Vue version first.

---

*Rule source: [`vue-doctor/correctness/prefer-defineProps-destructure`](https://github.com/remylagerweij/vue-doctor)*
