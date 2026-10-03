# `vue-doctor/security/no-token-in-web-storage`

> Keep tokens out of localStorage/sessionStorage: use an httpOnly, Secure, SameSite cookie set by the server, or keep the token in memory

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-922 |
| **OWASP** | A04:2021 |

## Why it matters

Keep tokens out of localStorage/sessionStorage: use an httpOnly, Secure, SameSite cookie set by the server, or keep the token in memory

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not persist access/refresh tokens, JWTs or session ids in `localStorage`/`sessionStorage` (including `useLocalStorage`, `useStorage` and Pinia `persist`). Have the server set the session as an `httpOnly; Secure; SameSite=Lax` cookie and send requests with `credentials: "include"`; if a token must be handled in the browser, keep it in memory (a Pinia store without `persist`, or a module variable) and use short-lived tokens. In Pinia persistence, exclude credentials with `persist: { pick: ["theme"] }`. CSRF tokens are not reported.

---

*Rule source: [`vue-doctor/security/no-token-in-web-storage`](https://github.com/remylagerweij/vue-doctor)*
