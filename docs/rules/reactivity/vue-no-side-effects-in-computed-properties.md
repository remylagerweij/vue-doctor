# `vue/no-side-effects-in-computed-properties`

> Computed properties must be pure — move side effects to `watch` or methods

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Computed properties must be pure — move side effects to `watch` or methods

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Make the computed pure: move mutations and assignments to methods, watchers or event handlers.

---

*Rule source: [`vue/no-side-effects-in-computed-properties`](https://github.com/remylagerweij/vue-doctor)*
