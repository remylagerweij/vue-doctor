# `vue-doctor/performance/js-early-exit`

> Use early returns to flatten deeply nested conditions for better readability

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use early returns to flatten deeply nested conditions for better readability

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Flatten deeply nested conditionals with guard clauses: return early for the failing cases and keep the main path unindented. Do not change behaviour.

---

*Rule source: [`vue-doctor/performance/js-early-exit`](https://github.com/remylagerweij/vue-doctor)*
