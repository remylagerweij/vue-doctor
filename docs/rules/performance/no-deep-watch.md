# `vue-doctor/performance/no-deep-watch`

> Watch the specific properties you need (`() => state.user.name`), limit the traversal with `deep: 1` (Vue 3.5+), or drop `deep` when the source is replaced rather than mutated

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

Watch the specific properties you need (`() => state.user.name`), limit the traversal with `deep: 1` (Vue 3.5+), or drop `deep` when the source is replaced rather than mutated

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

`{ deep: true }` traverses the whole source on every trigger, which matters for large arrays or nested objects. Watch the specific properties you need, use a numeric depth such as `deep: 1` (Vue 3.5+), or drop `deep` entirely when the parent replaces the array or object instead of mutating it. Deep watches on primitive sources or on getters that return a literal of plain reads are not reported.

---

*Rule source: [`vue-doctor/performance/no-deep-watch`](https://github.com/remylagerweij/vue-doctor)*
