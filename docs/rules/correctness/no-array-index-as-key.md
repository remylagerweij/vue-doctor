# `vue-doctor/correctness/no-array-index-as-key`

> Use a stable unique identifier: `:key="item.id"` — index keys break on reorder/filter

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

Use a stable unique identifier: `:key="item.id"` — index keys break on reorder/filter

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Use a stable unique id from the data, such as `:key="item.id"`, instead of the loop index; index keys break state on reorder, insert and filter.

---

*Rule source: [`vue-doctor/correctness/no-array-index-as-key`](https://github.com/remylagerweij/vue-doctor)*
