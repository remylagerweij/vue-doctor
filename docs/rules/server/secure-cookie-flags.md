# `vue-doctor/server/secure-cookie-flags`

> Set `httpOnly: true`, `secure: true`, and `sameSite: 'lax'` (or `'strict'`) on sensitive authentication/session cookies

| Property | Value |
|---|---|
| **Category** | Server |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-614, CWE-1004 |
| **OWASP** | A05:2021 |

## Why it matters

Set `httpOnly: true`, `secure: true`, and `sameSite: 'lax'` (or `'strict'`) on sensitive authentication/session cookies

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

When setting sensitive cookies with `setCookie(event, name, value, options)` in Nuxt server handlers, always set `httpOnly: true` (prevents XSS theft), `secure: true` (or `process.env.NODE_ENV === 'production'`) and `sameSite: 'lax'` or `'strict'` (prevents CSRF). For client-readable non-sensitive cookies (e.g. UI theme preference), this rule will not trigger if the name does not match auth/session keywords.

---

*Rule source: [`vue-doctor/server/secure-cookie-flags`](https://github.com/remylagerweij/vue-doctor)*
