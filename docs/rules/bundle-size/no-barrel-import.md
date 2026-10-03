# `vue-doctor/bundle-size/no-barrel-import`

> Import from the direct path: `import { Button } from './components/Button'` instead of `./components`

| Property | Value |
|---|---|
| **Category** | Bundle Size |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Import from the direct path: `import { Button } from './components/Button'` instead of `./components`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Import from the module that defines the symbol, for example `./components/Button`, instead of the folder `index` barrel, so unused exports can be tree-shaken.

---

*Rule source: [`vue-doctor/bundle-size/no-barrel-import`](https://github.com/remylagerweij/vue-doctor)*
