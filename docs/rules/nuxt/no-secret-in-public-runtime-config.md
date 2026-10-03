# `vue-doctor/nuxt/no-secret-in-public-runtime-config`

> Keep secrets in the top level of `runtimeConfig` (server only); `runtimeConfig.public` and `app.config` are sent to every browser

| Property | Value |
|---|---|
| **Category** | Nuxt |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-200 |
| **OWASP** | A05:2021 |

## Why it matters

Keep secrets in the top level of `runtimeConfig` (server only); `runtimeConfig.public` and `app.config` are sent to every browser

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Move the value out of `runtimeConfig.public` (or `app.config`) to the top level of `runtimeConfig`, which is only available on the server, and read it there with `useRuntimeConfig(event)`. Never expose it to client code. If a real secret was ever configured here, rotate it, because it has already been shipped to browsers. Names that are public by design (publishable or anon keys) are not reported.

---

*Rule source: [`vue-doctor/nuxt/no-secret-in-public-runtime-config`](https://github.com/remylagerweij/vue-doctor)*
