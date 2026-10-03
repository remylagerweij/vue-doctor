# `vue-doctor/bundle-size/prefer-dynamic-import`

> Use `defineAsyncComponent(() => import('./HeavyComponent.vue'))` for heavy components

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

Use `defineAsyncComponent(() => import('./HeavyComponent.vue'))` for heavy components

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Load heavy libraries or components lazily: `defineAsyncComponent(() => import('./Heavy.vue'))` for components, `await import('lib')` where the code is first needed.

---

*Rule source: [`vue-doctor/bundle-size/prefer-dynamic-import`](https://github.com/remylagerweij/vue-doctor)*
