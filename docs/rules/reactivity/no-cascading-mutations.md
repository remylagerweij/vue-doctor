# `vue-doctor/reactivity/no-cascading-mutations`

> Combine related state into a single reactive object or use a composable to manage state transitions

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Combine related state into a single reactive object or use a composable to manage state transitions

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Several state mutations in one watcher usually mean the state is split wrongly. Group the related refs into one reactive object or move the transition into a composable function, then update it in a single place.

---

*Rule source: [`vue-doctor/reactivity/no-cascading-mutations`](https://github.com/remylagerweij/vue-doctor)*
