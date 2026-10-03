# `vue-doctor/ecosystem/pinia-no-destructure`

> Directly destructuring a Pinia store breaks reactivity. Use `storeToRefs` instead.

| Property | Value |
|---|---|
| **Category** | Ecosystem |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.1.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Directly destructuring a Pinia store breaks reactivity. Use `storeToRefs` instead.

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not destructure a Pinia store directly. Use `const { count } = storeToRefs(store)` for state and getters, and call actions on the store object.

---

*Rule source: [`vue-doctor/ecosystem/pinia-no-destructure`](https://github.com/remylagerweij/vue-doctor)*
