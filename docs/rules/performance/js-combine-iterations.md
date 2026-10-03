# `vue-doctor/performance/js-combine-iterations`

> Combine chained `.map().filter()` into a single `.reduce()` or `for...of` loop

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

Combine chained `.map().filter()` into a single `.reduce()` or `for...of` loop

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Fuse chained `.map().filter()` calls into one pass with `for...of` or `.reduce()` so the array is iterated once. Preserve the order of side effects.

---

*Rule source: [`vue-doctor/performance/js-combine-iterations`](https://github.com/remylagerweij/vue-doctor)*
