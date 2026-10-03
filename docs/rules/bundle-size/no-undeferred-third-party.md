# `vue-doctor/bundle-size/no-undeferred-third-party`

> Use `useHead` with `defer: true` or add the `defer` attribute to third-party scripts

| Property | Value |
|---|---|
| **Category** | Bundle Size |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `useHead` with `defer: true` or add the `defer` attribute to third-party scripts

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Add `defer: true` (or `async: true`) to every script entry with a `src` passed to `useHead({ script: [...] })` so third-party scripts do not block rendering.

---

*Rule source: [`vue-doctor/bundle-size/no-undeferred-third-party`](https://github.com/remylagerweij/vue-doctor)*
