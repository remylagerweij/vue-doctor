# `vue-doctor/nuxt/nuxt-no-process-env-in-client`

> Use `useRuntimeConfig()`; expose client values through `runtimeConfig.public` in nuxt.config

| Property | Value |
|---|---|
| **Category** | Nuxt |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Use `useRuntimeConfig()`; expose client values through `runtimeConfig.public` in nuxt.config

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Only files that end up in the client bundle are checked (components, pages, layouts, composables, non-`.server` plugins, app middleware, stores, utils, `app.vue`); `server/`, `scripts/`, `shared/` and config files run in Node and may read `process.env`. Read configuration with `useRuntimeConfig()`. Declare values in `runtimeConfig` (server-only) or `runtimeConfig.public` (client) in `nuxt.config`.

---

*Rule source: [`vue-doctor/nuxt/nuxt-no-process-env-in-client`](https://github.com/remylagerweij/vue-doctor)*
