# `vue-doctor/security/no-ssrf`

> Never fetch a URL taken from the request as is: parse it with `new URL()` and compare the host with an allowlist, or build the URL from a fixed base and a validated path

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-918 |
| **OWASP** | A10:2021 |

## Why it matters

Never fetch a URL taken from the request as is: parse it with `new URL()` and compare the host with an allowlist, or build the URL from a fixed base and a validated path

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

A `$fetch`/`ofetch`/`fetch`/`axios`/`proxyRequest` URL that starts with a value from `getQuery`, `readBody`, `getRouterParam`, `getHeader` or `event.context.params` lets an attacker make the server call internal services (cloud metadata at 169.254.169.254, localhost admin ports). Fix it by (1) keeping the host fixed and only interpolating a validated path segment (`$fetch(`${config.apiBase}/users/${id}`)` with `id` validated by `getValidatedRouterParams`), or (2) parsing the value with `new URL(value)` and requiring `url.protocol === 'https:'` and `allowedHosts.includes(url.hostname)` before the request; never an `includes`/`startsWith` check on the raw string, and block private IP ranges when the allowlist cannot be fixed. A validator call (`assertAllowedUrl(x)`, `schema.parse(x)`) or an allowlist/comparison check on the value before the call silences the finding.

---

*Rule source: [`vue-doctor/security/no-ssrf`](https://github.com/remylagerweij/vue-doctor)*
