# `vue-doctor/reactivity/no-watch-for-computed`

> Replace the watcher with a computed property: `const value = computed(() => transform(source))`

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

Replace the watcher with a computed property: `const value = computed(() => transform(source))`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

The watcher only derives a value from its source. Delete the watcher and the ref it writes, and declare `const value = computed(() => ...)` using the same source.

---

*Rule source: [`vue-doctor/reactivity/no-watch-for-computed`](https://github.com/remylagerweij/vue-doctor)*
