# `vue-doctor/performance/js-hoist-regexp`

> Hoist a `new RegExp()` whose pattern does not change out of the loop so it is compiled once

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

Hoist a `new RegExp()` whose pattern does not change out of the loop so it is compiled once

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Only reported when every argument is a literal or a value that does not change inside the loop. Move the `new RegExp(...)` above the loop, or to a module-level constant when its arguments are all literals. A pattern built from the loop variable cannot be hoisted and is not reported.

---

*Rule source: [`vue-doctor/performance/js-hoist-regexp`](https://github.com/remylagerweij/vue-doctor)*
