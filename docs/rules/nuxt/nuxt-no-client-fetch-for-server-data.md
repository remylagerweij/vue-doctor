# `vue-doctor/nuxt/nuxt-no-client-fetch-for-server-data`

> Use `useFetch()` or `useAsyncData()` in Nuxt — data is fetched on the server and avoids client round-trip

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

Use `useFetch()` or `useAsyncData()` in Nuxt — data is fetched on the server and avoids client round-trip

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Fetch page data with `useFetch()` or `useAsyncData()` so it is loaded during SSR and not duplicated on the client; do not call `fetch`/`axios` in `onMounted` for initial data.

---

*Rule source: [`vue-doctor/nuxt/nuxt-no-client-fetch-for-server-data`](https://github.com/remylagerweij/vue-doctor)*
