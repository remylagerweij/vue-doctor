# `vue-doctor/performance/js-hoist-regexp`

> Hoist `new RegExp()` to a module-level constant to avoid re-compilation on every iteration

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

Hoist `new RegExp()` to a module-level constant to avoid re-compilation on every iteration

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Move the `new RegExp(...)` with a constant pattern out of the loop or function into a module-level constant so it is compiled once.

---

*Rule source: [`vue-doctor/performance/js-hoist-regexp`](https://github.com/remylagerweij/vue-doctor)*
