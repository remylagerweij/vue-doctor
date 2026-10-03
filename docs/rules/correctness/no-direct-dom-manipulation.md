# `vue-doctor/correctness/no-direct-dom-manipulation`

> Use template refs: `const el = ref<HTMLElement>()` with `ref="el"` instead of `document.querySelector()`

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

Use template refs: `const el = ref<HTMLElement>()` with `ref="el"` instead of `document.querySelector()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Use a template ref (`const el = ref<HTMLElement | null>(null)` with `ref="el"`) and access `el.value` after mount instead of `document.querySelector`.

---

*Rule source: [`vue-doctor/correctness/no-direct-dom-manipulation`](https://github.com/remylagerweij/vue-doctor)*
