# `vue-doctor/performance/no-layout-property-animation`

> Use `transform: translateX()` or `scale()` instead — they run on the compositor and skip layout/paint

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `transform: translateX()` or `scale()` instead — they run on the compositor and skip layout/paint

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Animate compositor-friendly properties only. Replace animated width/height/top/left/margin with `transform: translate()/scale()` and `opacity`.

---

*Rule source: [`vue-doctor/performance/no-layout-property-animation`](https://github.com/remylagerweij/vue-doctor)*
