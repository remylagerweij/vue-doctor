# `vue-doctor/performance/client-passive-event-listeners`

> Add `{ passive: true }` as the third argument: `addEventListener('touchmove', handler, { passive: true })`

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Add `{ passive: true }` as the third argument: `addEventListener('touchmove', handler, { passive: true })`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Pass `{ passive: true }` as the third argument of `addEventListener` for `touchstart`, `touchmove` and `wheel`, so the browser can scroll without waiting for the handler. If the handler must call `preventDefault()`, pass `{ passive: false }` explicitly instead. `scroll` and `touchend` cannot block scrolling and are not reported.

---

*Rule source: [`vue-doctor/performance/client-passive-event-listeners`](https://github.com/remylagerweij/vue-doctor)*
