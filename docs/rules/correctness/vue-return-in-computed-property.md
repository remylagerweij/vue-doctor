# `vue/return-in-computed-property`

> Every computed property must return a value

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

Every computed property must return a value

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Return a value on every code path of the computed getter.

---

*Rule source: [`vue/return-in-computed-property`](https://github.com/remylagerweij/vue-doctor)*
