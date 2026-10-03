# `vue-doctor/nuxt/nuxt-require-seo-meta`

> Use `useSeoMeta({ title, description })` instead of passing `meta` tags to `useHead()`

| Property | Value |
|---|---|
| **Category** | Nuxt |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | nuxt |


## Why it matters

Use `useSeoMeta({ title, description })` instead of passing `meta` tags to `useHead()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace `useHead({ meta: [...] })` with `useSeoMeta({ title, description, ogTitle, ... })` for type-safe SEO tags.

---

*Rule source: [`vue-doctor/nuxt/nuxt-require-seo-meta`](https://github.com/remylagerweij/vue-doctor)*
