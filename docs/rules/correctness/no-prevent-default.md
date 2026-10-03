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

Use Vue's event modifier in the template, such as `@submit.prevent`, instead of calling `event.preventDefault()` in the handler. Only handlers that always call `preventDefault()` on their own event argument are flagged; conditional calls and listeners registered with addEventListener are left alone.

---

*Rule source: [`vue-doctor/correctness/no-prevent-default`](https://github.com/remylagerweij/vue-doctor)*
