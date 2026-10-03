# `vue-doctor/ecosystem/router-no-string-push`

> Pass a route object (e.g. `{ name: 'user', params: { id } }`) instead of a path built with string interpolation to router.push/replace.

| Property | Value |
|---|---|
| **Category** | Ecosystem |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.1.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Pass a route object (e.g. `{ name: 'user', params: { id } }`) instead of a path built with string interpolation to router.push/replace.

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace a path assembled with a template literal or `+` in `router.push`/`replace` by a route location object, such as `{ name: 'user', params: { id } }`, so params are encoded. Static paths like `'/login'` are fine.

---

*Rule source: [`vue-doctor/ecosystem/router-no-string-push`](https://github.com/remylagerweij/vue-doctor)*
