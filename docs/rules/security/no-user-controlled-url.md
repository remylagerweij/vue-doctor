# `vue-doctor/security/no-user-controlled-url`

> Validate the URL before navigating: parse it with `new URL(value, location.origin)` and allow only `http:`/`https:` on your own origin

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-79, CWE-601 |
| **OWASP** | A03:2021 |

## Why it matters

Validate the URL before navigating: parse it with `new URL(value, location.origin)` and allow only `http:`/`https:` on your own origin

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Never assign a route query/param, `location.hash`/`location.search` or `window.name` value straight to `location.href`, `location.assign/replace`, `window.open`, an `<a>`'s `href`, or `src`/`action`. Parse it first: `const url = new URL(value, location.origin)` and accept it only when `url.origin === location.origin` (or the host is on an allowlist) and `url.protocol` is `http:` or `https:`; otherwise fall back to `/`. For in-app navigation pass a path to `router.push`. A sanitizer or validator call (`sanitizeUrl(x)`, `isSafeUrl(x)`) next to the sink silences the finding.

---

*Rule source: [`vue-doctor/security/no-user-controlled-url`](https://github.com/remylagerweij/vue-doctor)*
