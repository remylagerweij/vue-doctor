# `vue-doctor/performance/js-batch-dom-css`

> Read layout (`offsetHeight`, `getBoundingClientRect()`) before writing styles, not between style writes

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Read layout (`offsetHeight`, `getBoundingClientRect()`) before writing styles, not between style writes

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Reported when a layout read sits between style writes in the same block, or a loop body both writes styles and reads layout: each read forces a synchronous reflow (layout thrashing). Do all reads first and all writes after, or move the writes into `requestAnimationFrame`. Consecutive style writes alone are fine: the browser batches them until the next read. A bare `el.offsetHeight;` used to restart a transition is deliberate and not reported.

---

*Rule source: [`vue-doctor/performance/js-batch-dom-css`](https://github.com/remylagerweij/vue-doctor)*
