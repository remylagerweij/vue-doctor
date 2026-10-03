# `vue/no-ref-as-operand`

> Use `.value` to access the ref value in expressions

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `.value` to access the ref value in expressions

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Access a ref's value through `.value` in script code (not in the template, where refs unwrap automatically).

---

*Rule source: [`vue/no-ref-as-operand`](https://github.com/remylagerweij/vue-doctor)*
