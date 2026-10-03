# `vue-doctor/performance/no-permanent-will-change`

> Add will-change on animation start and remove on end. Permanent promotion wastes GPU memory

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

Add will-change on animation start and remove on end. Permanent promotion wastes GPU memory

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Remove the static `will-change`. Apply it just before the animation starts (for example on hover or via a class added in JS) and remove it when the animation ends.

---

*Rule source: [`vue-doctor/performance/no-permanent-will-change`](https://github.com/remylagerweij/vue-doctor)*
