# `vue-doctor/architecture/no-giant-component`

> Extract logical sections into focused components or composables

| Property | Value |
|---|---|
| **Category** | Architecture |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Extract logical sections into focused components or composables

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Split the component by responsibility. Extract self-contained template sections into child components and stateful logic into composables; keep behaviour and props/emits of the public component unchanged.

---

*Rule source: [`vue-doctor/architecture/no-giant-component`](https://github.com/remylagerweij/vue-doctor)*
