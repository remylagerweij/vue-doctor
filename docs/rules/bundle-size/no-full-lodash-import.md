# `vue-doctor/bundle-size/no-full-lodash-import`

> Import the specific function: `import debounce from 'lodash/debounce'` — saves ~70kb

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

Import the specific function: `import debounce from 'lodash/debounce'` — saves ~70kb

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Import the single function (`import debounce from 'lodash/debounce'`) or switch to `lodash-es`/native code instead of importing the full library.

---

*Rule source: [`vue-doctor/bundle-size/no-full-lodash-import`](https://github.com/remylagerweij/vue-doctor)*
