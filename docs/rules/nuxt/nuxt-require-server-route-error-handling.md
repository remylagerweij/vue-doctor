# `vue-doctor/nuxt/nuxt-require-server-route-error-handling`

> Wrap the handler body in try/catch and throw `createError({ statusCode, statusMessage })` on failure

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

Wrap the handler body in try/catch and throw `createError({ statusCode, statusMessage })` on failure

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Wrap the body of `defineEventHandler` in try/catch and rethrow failures with `createError({ statusCode, statusMessage })` so clients get a proper error response.

---

*Rule source: [`vue-doctor/nuxt/nuxt-require-server-route-error-handling`](https://github.com/remylagerweij/vue-doctor)*
