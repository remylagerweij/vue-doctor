# `vue-doctor/performance/js-combine-iterations`

> Fuse long `.filter().map().filter()` chains, or chains that run inside a loop, into one `.reduce()` or `for...of` pass

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Fuse long `.filter().map().filter()` chains, or chains that run inside a loop, into one `.reduce()` or `for...of` pass

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Only chains of three or more iteration methods, or chains evaluated on every iteration of a loop or array callback, are reported. Fuse them into one pass with `for...of` or `.reduce()`, preserving the order of side effects. A single `.map().filter()` over a small array costs microseconds and is better left readable.

---

*Rule source: [`vue-doctor/performance/js-combine-iterations`](https://github.com/remylagerweij/vue-doctor)*
