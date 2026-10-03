# `vue/no-template-shadow`

> Rename the variable to avoid shadowing a component property

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

Rename the variable to avoid shadowing a component property

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Rename the `v-for`/slot variable so it no longer shadows a prop, data or setup binding of the same name.

---

*Rule source: [`vue/no-template-shadow`](https://github.com/remylagerweij/vue-doctor)*
