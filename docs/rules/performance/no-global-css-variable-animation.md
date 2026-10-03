# `vue-doctor/performance/no-global-css-variable-animation`

> Set the variable on the nearest element instead of a parent, or use `@property` with `inherits: false`

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

Set the variable on the nearest element instead of a parent, or use `@property` with `inherits: false`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not animate a CSS variable on `:root`/`body`; every dependent element restyles each frame. Set the variable on the nearest element that uses it, or register it with `@property` and `inherits: false`.

---

*Rule source: [`vue-doctor/performance/no-global-css-variable-animation`](https://github.com/remylagerweij/vue-doctor)*
