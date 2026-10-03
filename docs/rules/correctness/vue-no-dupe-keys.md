# `vue/no-dupe-keys`

> Remove the duplicate key — properties and computed names must be unique

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

Remove the duplicate key — properties and computed names must be unique

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Rename or remove the duplicate; props, data, computed and methods must not share names.

---

*Rule source: [`vue/no-dupe-keys`](https://github.com/remylagerweij/vue-doctor)*
