# `vue-doctor/performance/js-cache-storage`

> Cache `localStorage.getItem()` result in a variable to avoid redundant reads

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

Cache `localStorage.getItem()` result in a variable to avoid redundant reads

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Read `localStorage`/`sessionStorage` once into a local variable and reuse it; storage access is synchronous and slow.

---

*Rule source: [`vue-doctor/performance/js-cache-storage`](https://github.com/remylagerweij/vue-doctor)*
