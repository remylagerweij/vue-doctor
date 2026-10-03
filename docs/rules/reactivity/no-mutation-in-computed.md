# `vue-doctor/reactivity/no-mutation-in-computed`

> Keep computed getters pure — move mutations into a method, a `watch` callback or an event handler

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

Keep computed getters pure — move mutations into a method, a `watch` callback or an event handler

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

A computed getter must be pure. Move assignments to `.value` and array mutations such as push/sort into a method, event handler or `watch`; if sorting, copy first with `[...list].sort()` or `toSorted()`.

---

*Rule source: [`vue-doctor/reactivity/no-mutation-in-computed`](https://github.com/remylagerweij/vue-doctor)*
