# `vue-doctor/nuxt/nuxt-no-head-import`

> Use `useHead()` composable or `definePageMeta()` instead of importing head utilities

| Property | Value |
|---|---|
| **Category** | Nuxt |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | nuxt |


## Why it matters

Use `useHead()` composable or `definePageMeta()` instead of importing head utilities

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Remove the import from `@vueuse/head` or `@unhead/vue`; Nuxt auto-imports `useHead()` and `useSeoMeta()`, so call them without an import.

---

*Rule source: [`vue-doctor/nuxt/nuxt-no-head-import`](https://github.com/remylagerweij/vue-doctor)*
