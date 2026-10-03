# `vue-doctor/performance/js-tosorted-immutable`

> Use `array.toSorted()` (ES2023) instead of `[...array].sort()` for cleaner immutable sorting

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

Use `array.toSorted()` (ES2023) instead of `[...array].sort()` for cleaner immutable sorting

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace `[...array].sort(compare)` with `array.toSorted(compare)`; check that the project's target supports ES2023 first.

---

*Rule source: [`vue-doctor/performance/js-tosorted-immutable`](https://github.com/remylagerweij/vue-doctor)*
