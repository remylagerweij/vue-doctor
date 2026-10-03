# `vue-doctor/security/no-secret-named-literal`

> Load the value from an environment variable instead of committing it. Only `VITE_*` / `NUXT_PUBLIC_*` values are meant for the client

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-798 |
| **OWASP** | A07:2021 |

## Why it matters

Load the value from an environment variable instead of committing it. Only `VITE_*` / `NUXT_PUBLIC_*` values are meant for the client

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Check whether the literal is a real credential. If it is, remove it from the source, revoke and rotate it, and read it from `process.env` on the server (or `runtimeConfig` outside `public` in Nuxt). If it is a public identifier or a test value, rename the variable so it is not secret-like, or suppress the finding with a reason. Never write the credential value into code, comments, commits or your reply.

---

*Rule source: [`vue-doctor/security/no-secret-named-literal`](https://github.com/remylagerweij/vue-doctor)*
