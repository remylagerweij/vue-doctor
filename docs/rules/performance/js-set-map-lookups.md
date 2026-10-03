# `vue-doctor/performance/js-set-map-lookups`

> Convert the array to a `Set` before the loop for O(1) lookups instead of O(n)

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

Convert the array to a `Set` before the loop for O(1) lookups instead of O(n)

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Convert the array used for `includes`/`indexOf` lookups inside the loop into a `Set` created once before the loop.

---

*Rule source: [`vue-doctor/performance/js-set-map-lookups`](https://github.com/remylagerweij/vue-doctor)*
