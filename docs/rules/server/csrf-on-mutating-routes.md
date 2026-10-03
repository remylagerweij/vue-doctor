# `vue-doctor/server/csrf-on-mutating-routes`

> Protect state-changing (mutating) API endpoints against Cross-Site Request Forgery (CSRF)

| Property | Value |
|---|---|
| **Category** | Server |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-352 |
| **OWASP** | A01:2021 |

## Why it matters

Protect state-changing (mutating) API endpoints against Cross-Site Request Forgery (CSRF)

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Mutating endpoints (`.post`, `.put`, `.patch`, `.delete`) that authenticate via cookies are vulnerable to CSRF if requests from third-party sites are accepted. Verify the `Origin` / `Referer` header matches your site origin, use a CSRF token (or `nuxt-csurf` / `nuxt-security`), or ensure session cookies use `SameSite: Strict` or `Lax`.

---

*Rule source: [`vue-doctor/server/csrf-on-mutating-routes`](https://github.com/remylagerweij/vue-doctor)*
