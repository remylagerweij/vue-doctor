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


## Why it matters

Use `useRuntimeConfig()`; expose client values through `runtimeConfig.public` in nuxt.config

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Read configuration with `useRuntimeConfig()`. Declare values in `runtimeConfig` (server-only) or `runtimeConfig.public` (client) in `nuxt.config`, and do not use `process.env` in app code.

---

*Rule source: [`vue-doctor/nuxt/nuxt-no-process-env-in-client`](https://github.com/remylagerweij/vue-doctor)*
