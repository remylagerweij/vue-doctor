# `vue-doctor/performance/js-tosorted-immutable`

> Use `array.toSorted()` instead of `[...array].sort()`: same cost, clearer intent. Requires an ES2023 build target

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

Use `array.toSorted()` instead of `[...array].sort()`: same cost, clearer intent. Requires an ES2023 build target

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

This is a readability rewrite, not a speed-up: `toSorted` copies the array just like the spread does. Replace `[...array].sort(compare)` with `array.toSorted(compare)` only when the receiver is a real array (Sets, Maps and iterators have no `toSorted`) and the build target supports ES2023 (Chrome 110, Firefox 115, Safari 16); Vite does not polyfill it. Leave the spread when either is not the case.

---

*Rule source: [`vue-doctor/performance/js-tosorted-immutable`](https://github.com/remylagerweij/vue-doctor)*
