# `vue-doctor/ecosystem/pinia-no-watch-store`

> Use `<store>.$subscribe()` or watch specific primitive getters instead of deep watching the entire store.

| Property | Value |
|---|---|
| **Category** | Ecosystem |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.1.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `<store>.$subscribe()` or watch specific primitive getters instead of deep watching the entire store.

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not watch an entire store object. Watch a specific field with `watch(() => store.field, ...)`, or react to changes with `store.$subscribe()`.

---

*Rule source: [`vue-doctor/ecosystem/pinia-no-watch-store`](https://github.com/remylagerweij/vue-doctor)*
