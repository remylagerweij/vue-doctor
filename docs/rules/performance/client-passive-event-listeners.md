# `vue-doctor/performance/client-passive-event-listeners`

> Add `{ passive: true }` as the third argument: `addEventListener('scroll', handler, { passive: true })`

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

Add `{ passive: true }` as the third argument: `addEventListener('scroll', handler, { passive: true })`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Pass `{ passive: true }` as the third argument of `addEventListener` for scroll, touch and wheel events, unless the handler must call `preventDefault()`.

---

*Rule source: [`vue-doctor/performance/client-passive-event-listeners`](https://github.com/remylagerweij/vue-doctor)*
