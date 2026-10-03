# `vue-doctor/reactivity/no-missing-await-nextTick`

> Add `await` before `nextTick()` or use `nextTick().then()` to ensure DOM updates are applied

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Add `await` before `nextTick()` or use `nextTick().then()` to ensure DOM updates are applied

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

`nextTick()` returns a promise. Add `await` in an async function, or chain `.then()`, before code that reads the updated DOM.

---

*Rule source: [`vue-doctor/reactivity/no-missing-await-nextTick`](https://github.com/remylagerweij/vue-doctor)*
