# `vue-doctor/security/no-secret-in-public-env-file`

> `VITE_*`, `NUXT_PUBLIC_*` and `PUBLIC_*` variables are inlined into the browser bundle; rename secrets without the public prefix and read them on the server

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `fs` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-540 |
| **OWASP** | A05:2021 |

## Why it matters

`VITE_*`, `NUXT_PUBLIC_*` and `PUBLIC_*` variables are inlined into the browser bundle; rename secrets without the public prefix and read them on the server

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

In the `.env*` file, rename the variable so it no longer starts with `VITE_`, `VUE_APP_`, `NUXT_PUBLIC_` or `PUBLIC_`, and read it only on the server (for Nuxt, a top-level `runtimeConfig` key filled from `NUXT_<NAME>`). Update every place that reads the old name. Rotate the secret, since public variables end up in the shipped JavaScript. Do not print or copy the value. Publishable and anon keys can stay public.

---

*Rule source: [`vue-doctor/security/no-secret-in-public-env-file`](https://github.com/remylagerweij/vue-doctor)*
