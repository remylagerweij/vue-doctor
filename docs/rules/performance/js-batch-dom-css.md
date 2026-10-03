# `vue-doctor/performance/js-batch-dom-css`

> Batch style changes with `el.style.cssText` or `el.classList.add()` to avoid multiple reflows

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

Batch style changes with `el.style.cssText` or `el.classList.add()` to avoid multiple reflows

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Batch consecutive `el.style.x = ...` writes into one `el.style.cssText`/`Object.assign(el.style, {...})` or toggle a CSS class, so the browser lays out once.

---

*Rule source: [`vue-doctor/performance/js-batch-dom-css`](https://github.com/remylagerweij/vue-doctor)*
