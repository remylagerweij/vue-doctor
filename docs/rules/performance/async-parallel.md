# `vue-doctor/performance/async-parallel`

> Use `const [a, b] = await Promise.all([fetchA(), fetchB()])` to run independent operations concurrently

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

Use `const [a, b] = await Promise.all([fetchA(), fetchB()])` to run independent operations concurrently

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Independent awaits run one after another. Start them together with `const [a, b] = await Promise.all([fetchA(), fetchB()])`; keep sequential awaits only where a later call needs an earlier result.

---

*Rule source: [`vue-doctor/performance/async-parallel`](https://github.com/remylagerweij/vue-doctor)*
