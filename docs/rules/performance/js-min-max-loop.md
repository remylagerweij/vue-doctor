# `vue-doctor/performance/js-min-max-loop`

> Use `Math.min(...array)` or `Math.max(...array)` — O(n) instead of O(n log n) with sort

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

Use `Math.min(...array)` or `Math.max(...array)` — O(n) instead of O(n log n) with sort

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not sort a whole array just to read the smallest or largest item. Use `Math.min(...values)`/`Math.max(...values)` or a single reduce pass.

---

*Rule source: [`vue-doctor/performance/js-min-max-loop`](https://github.com/remylagerweij/vue-doctor)*
