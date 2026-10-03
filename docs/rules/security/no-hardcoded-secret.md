# `vue-doctor/security/no-hardcoded-secret`

> Revoke the key and load it from a server-side environment variable (`process.env.X` in `server/`). Only public keys (`VITE_*` / `NUXT_PUBLIC_*`) belong in client code

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `error` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-798 |
| **OWASP** | A07:2021 |

## Why it matters

Revoke the key and load it from a server-side environment variable (`process.env.X` in `server/`). Only public keys (`VITE_*` / `NUXT_PUBLIC_*`) belong in client code

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Remove the hardcoded credential from the source and treat it as leaked: it must be revoked and rotated, since it is already in git history and in the shipped bundle. Read the new key on the server from `process.env` (or Nuxt `runtimeConfig` outside `public`) and call the provider from a server route; never write the credential value into code, comments, commits or your reply.

---

*Rule source: [`vue-doctor/security/no-hardcoded-secret`](https://github.com/remylagerweij/vue-doctor)*
