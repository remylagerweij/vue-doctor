# `vue/no-unused-vars`

> Remove the unused variable or prefix with `_` to indicate intentional

| Property | Value |
|---|---|
| **Category** | Dead Code |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Remove the unused variable or prefix with `_` to indicate intentional

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Remove the unused `v-for`/slot-scope variable, or prefix it with an underscore if the position is required.

---

*Rule source: [`vue/no-unused-vars`](https://github.com/remylagerweij/vue-doctor)*
