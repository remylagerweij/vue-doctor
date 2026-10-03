# `vue/valid-v-model`

> Fix the `v-model` directive — it must bind to a writable expression

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `error` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Fix the `v-model` directive — it must bind to a writable expression

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Bind `v-model` to a writable variable or property; do not use it on a v-for alias, literal or computed expression.

---

*Rule source: [`vue/valid-v-model`](https://github.com/remylagerweij/vue-doctor)*
