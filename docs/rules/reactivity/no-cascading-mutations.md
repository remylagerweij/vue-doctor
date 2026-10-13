# `vue-doctor/reactivity/no-cascading-mutations`

> Derive the second value with `computed()` instead of chaining watchers, or update both values in one place

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

Derive the second value with `computed()` instead of chaining watchers, or update both values in one place

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

One watcher writes state that a second watcher watches, and the second one derives more state from it, so every change cascades through two flush cycles. Replace the derived ref of the second watcher with `computed(() => ...)` over the same source, or move both updates into the function that starts the change. Several assignments in one watcher (a form reset) are not reported.

---

*Rule source: [`vue-doctor/reactivity/no-cascading-mutations`](https://github.com/remylagerweij/vue-doctor)*
