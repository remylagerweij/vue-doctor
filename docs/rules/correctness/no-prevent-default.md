# `vue-doctor/correctness/no-prevent-default`

> Use Vue's `.prevent` modifier: `@submit.prevent` instead of calling `event.preventDefault()`

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use Vue's `.prevent` modifier: `@submit.prevent` instead of calling `event.preventDefault()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Use Vue's event modifier in the template, such as `@submit.prevent`, instead of calling `event.preventDefault()` in the handler. Only handlers in `.vue` files that always call `preventDefault()` on their own event argument are flagged; calls after a guard `return`, other conditional calls and handlers registered with addEventListener/useEventListener are left alone, because `.prevent` would cancel events the handler deliberately lets through (Tab, unrelated keys).

---

*Rule source: [`vue-doctor/correctness/no-prevent-default`](https://github.com/remylagerweij/vue-doctor)*
