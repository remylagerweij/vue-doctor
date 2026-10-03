# `vue-doctor/nuxt/security-headers`

> Configure security headers and avoid insecure defaults in `nuxt.config.ts` (e.g. disable devtools in production, protect client sourcemaps)

| Property | Value |
|---|---|
| **Category** | Nuxt |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-693 |
| **OWASP** | A05:2021 |

## Why it matters

Configure security headers and avoid insecure defaults in `nuxt.config.ts` (e.g. disable devtools in production, protect client sourcemaps)

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

In `nuxt.config.ts`, ensure devtools are disabled in production (`devtools: { enabled: false }` or omitted), client sourcemaps are restricted or omitted (`sourcemap: { client: false }`), and consider adding a security headers module like `nuxt-security` to configure Content-Security-Policy (CSP), HSTS, and X-Content-Type-Options headers.

---

*Rule source: [`vue-doctor/nuxt/security-headers`](https://github.com/remylagerweij/vue-doctor)*
