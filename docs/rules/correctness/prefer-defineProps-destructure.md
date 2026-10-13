# `vue-doctor/correctness/prefer-defineProps-destructure`

> Destructure props with native defaults: `const { title, size = "md" } = defineProps<Props>()` (Vue 3.5+)

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Destructure props with native defaults: `const { title, size = "md" } = defineProps<Props>()` (Vue 3.5+)

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Only reported on Vue 3.5+ projects with reactive props destructure enabled, and only when the props object is used solely as `props.x`. Replace `const props = defineProps<Props>()` (or `withDefaults(defineProps<Props>(), { ... })`) with `const { a, b = 1 } = defineProps<Props>()` and rename `props.a` to `a`. Watch a destructured prop through a getter (`watch(() => a, ...)`) and pass it to composables as `toRef(() => a)` or `() => a`.

---

*Rule source: [`vue-doctor/correctness/prefer-defineProps-destructure`](https://github.com/remylagerweij/vue-doctor)*
