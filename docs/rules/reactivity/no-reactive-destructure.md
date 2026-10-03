# `vue-doctor/reactivity/no-reactive-destructure`

> Use `toRefs(state)` before destructuring to keep reactivity, or access properties directly: `state.count`

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

Use `toRefs(state)` before destructuring to keep reactivity, or access properties directly: `state.count`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Destructuring a `reactive()` object copies plain values and drops reactivity. Wrap it with `toRefs(state)` before destructuring, or read `state.prop` directly.

---

*Rule source: [`vue-doctor/reactivity/no-reactive-destructure`](https://github.com/remylagerweij/vue-doctor)*
