# `vue-doctor/bundle-size/no-moment`

> Replace with `import { format } from 'date-fns'` (tree-shakeable) or `import dayjs from 'dayjs'` (2kb)

| Property | Value |
|---|---|
| **Category** | Bundle Size |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Replace with `import { format } from 'date-fns'` (tree-shakeable) or `import dayjs from 'dayjs'` (2kb)

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace Moment.js with `date-fns` or `dayjs` (or `Intl`/`Temporal` where possible) and update the call sites accordingly.

---

*Rule source: [`vue-doctor/bundle-size/no-moment`](https://github.com/remylagerweij/vue-doctor)*
