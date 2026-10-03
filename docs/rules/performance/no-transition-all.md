# `vue-doctor/performance/no-transition-all`

> List specific properties: `transition: "opacity 200ms, transform 200ms"` — or in Tailwind use `transition-colors`, `transition-opacity`, or `transition-transform`

| Property | Value |
|---|---|
| **Category** | Performance |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

List specific properties: `transition: "opacity 200ms, transform 200ms"` — or in Tailwind use `transition-colors`, `transition-opacity`, or `transition-transform`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace `transition: all` with an explicit property list, for example `transition: opacity 200ms, transform 200ms`, naming only the properties that actually change.

---

*Rule source: [`vue-doctor/performance/no-transition-all`](https://github.com/remylagerweij/vue-doctor)*
