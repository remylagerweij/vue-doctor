# `vue-doctor/security/no-secret-in-public-env`

> Variables with a `VITE_` / `NUXT_PUBLIC_` prefix are inlined into the browser bundle; keep secrets in server-only variables

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-540 |
| **OWASP** | A05:2021 |

## Why it matters

Variables with a `VITE_` / `NUXT_PUBLIC_` prefix are inlined into the browser bundle; keep secrets in server-only variables

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not read a secret through a public variable (`import.meta.env.VITE_*`, `process.env.NUXT_PUBLIC_*`, `useRuntimeConfig().public.*`): its value is shipped to every visitor. Rename it without the public prefix, read it only on the server (a `server/` route or a backend), and call that from the client. Rotate the secret, since it has already been exposed. Publishable and anon keys are fine in public variables.

---

*Rule source: [`vue-doctor/security/no-secret-in-public-env`](https://github.com/remylagerweij/vue-doctor)*
