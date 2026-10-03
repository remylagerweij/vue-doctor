# `vue/no-duplicate-attributes`

> Remove the duplicate attribute from the template tag

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

Remove the duplicate attribute from the template tag

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Remove the repeated attribute from the element; merge `class`/`style` values if both are needed.

---

*Rule source: [`vue/no-duplicate-attributes`](https://github.com/remylagerweij/vue-doctor)*
