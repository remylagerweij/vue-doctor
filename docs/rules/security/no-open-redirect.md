# `vue-doctor/security/no-open-redirect`

> Redirect only to relative paths or allow-listed hosts: check `value.startsWith('/') && !value.startsWith('//')`, or parse it with `new URL(value, origin)` and compare the origin

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-601 |
| **OWASP** | A01:2021 |

## Why it matters

Redirect only to relative paths or allow-listed hosts: check `value.startsWith('/') && !value.startsWith('//')`, or parse it with `new URL(value, origin)` and compare the origin

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Never pass a query parameter, body field or route param straight to `sendRedirect(event, x)`, `navigateTo(x, { external: true })` or a `Location` header: an attacker links to your site with `?next=https://evil.example` and uses your domain for phishing. Accept only a relative path (`next.startsWith('/') && !next.startsWith('//')`) or parse it with `new URL(next, requestOrigin)` and require `url.origin === requestOrigin` (or the host on an allowlist), and fall back to `/` otherwise. A redirect to a fixed path with the value only in the query string (`/login?next=${next}`) is fine. A validator call (`isSafeRedirect(x)`) or a prefix/origin check on the value before the call silences the finding.

---

*Rule source: [`vue-doctor/security/no-open-redirect`](https://github.com/remylagerweij/vue-doctor)*
