# `vue-doctor/reactivity/no-reactive-replace`

> Use `Object.assign(state, newState)` instead of replacing the reactive object reference

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `Object.assign(state, newState)` instead of replacing the reactive object reference

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Reassigning a `reactive()` variable breaks every existing reference to it. Mutate it in place with `Object.assign(state, next)`, or switch to a `ref` and assign `.value`.

---

*Rule source: [`vue-doctor/reactivity/no-reactive-replace`](https://github.com/remylagerweij/vue-doctor)*
