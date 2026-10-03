# `vue-doctor/architecture/no-nested-component-definition`

> Move to a separate .vue file or to a composable

| Property | Value |
|---|---|
| **Category** | Architecture |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Move to a separate .vue file or to a composable

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

A component defined inside another component is recreated on every render and loses state. Move it to its own `.vue` file or to module scope and import it.

---

*Rule source: [`vue-doctor/architecture/no-nested-component-definition`](https://github.com/remylagerweij/vue-doctor)*
