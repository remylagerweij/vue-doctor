# `vue-doctor/performance/no-deep-watch`

> Watch the specific properties you need (`() => state.user.name`) or use `watchEffect()` instead of `{ deep: true }`

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

Watch the specific properties you need (`() => state.user.name`) or use `watchEffect()` instead of `{ deep: true }`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace `{ deep: true }` with a watch on the specific properties you need, such as `watch(() => state.user.name, ...)`, or use `watchEffect` which tracks only what it reads.

---

*Rule source: [`vue-doctor/performance/no-deep-watch`](https://github.com/remylagerweij/vue-doctor)*
