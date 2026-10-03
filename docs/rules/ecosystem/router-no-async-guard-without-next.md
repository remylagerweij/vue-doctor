# `vue-doctor/ecosystem/router-no-async-guard-without-next`

> An async beforeEach/beforeResolve guard that declares `next` must call it, otherwise navigation never resolves. Prefer returning a value and dropping `next`.

| Property | Value |
|---|---|
| **Category** | Ecosystem |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.1.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

An async beforeEach/beforeResolve guard that declares `next` must call it, otherwise navigation never resolves. Prefer returning a value and dropping `next`.

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

In an async `beforeEach`/`beforeResolve` guard, either remove the `next` parameter and return `true`, `false` or a route location, or make sure `next()` is called exactly once on every code path.

---

*Rule source: [`vue-doctor/ecosystem/router-no-async-guard-without-next`](https://github.com/remylagerweij/vue-doctor)*
