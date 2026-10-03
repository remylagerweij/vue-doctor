# `vue-doctor/nuxt/nuxt-async-client-component`

> Avoid async setup in client components. Use `useFetch()` or `useAsyncData()` instead

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

Avoid async setup in client components. Use `useFetch()` or `useAsyncData()` instead

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Avoid `await` in the setup of a client-only component. Fetch with `useAsyncData()`/`useFetch()` or load in `onMounted` with a loading state.

---

*Rule source: [`vue-doctor/nuxt/nuxt-async-client-component`](https://github.com/remylagerweij/vue-doctor)*
