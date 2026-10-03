# `vue-doctor/performance/js-index-maps`

> Build a `Map` indexed by the search key before the loop for O(1) lookups

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Build a `Map` indexed by the search key before the loop for O(1) lookups

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Build a `Map` keyed by the lookup field once before the loop and use `map.get(key)` instead of calling `find`/`filter` for each item.

---

*Rule source: [`vue-doctor/performance/js-index-maps`](https://github.com/remylagerweij/vue-doctor)*
