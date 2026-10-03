# `vue-doctor/reactivity/no-fetch-in-watch`

> Use `useFetch()` (Nuxt) or `useQuery()` from @tanstack/vue-query instead of watch + fetch

| Property | Value |
|---|---|
| **Category** | Reactivity |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |


## Why it matters

Use `useFetch()` (Nuxt) or `useQuery()` from @tanstack/vue-query instead of watch + fetch

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not fetch inside a watcher. Move the request into `useFetch`/`useAsyncData` (Nuxt) or a query composable such as `useQuery` whose key is the reactive source, so the framework handles caching, cancellation and SSR.

---

*Rule source: [`vue-doctor/reactivity/no-fetch-in-watch`](https://github.com/remylagerweij/vue-doctor)*
