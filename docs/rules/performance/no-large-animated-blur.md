# `vue-doctor/performance/no-large-animated-blur`

> Keep blur radius under 10px, or apply blur to a smaller element

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

Keep blur radius under 10px, or apply blur to a smaller element

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Reduce the animated blur radius to 10px or less, or apply the blur to a smaller element. Large animated blurs are expensive on the GPU.

---

*Rule source: [`vue-doctor/performance/no-large-animated-blur`](https://github.com/remylagerweij/vue-doctor)*
