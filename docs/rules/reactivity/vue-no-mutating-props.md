# `vue/no-mutating-props`

> Never modify a prop directly — emit an event to the parent instead

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

Never modify a prop directly — emit an event to the parent instead

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Never assign to a prop or mutate it in the template. Emit an event so the parent updates the value, or copy the prop into local state.

---

*Rule source: [`vue/no-mutating-props`](https://github.com/remylagerweij/vue-doctor)*
