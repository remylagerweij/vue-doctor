# `vue-doctor/server/server-no-console-in-handler`

> Remove debug `console.log/debug/trace` calls from request handlers; they flood production logs and can leak request data

| Property | Value |
|---|---|
| **Category** | Server |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | nuxt |


## Why it matters

Remove debug `console.log/debug/trace` calls from request handlers; they flood production logs and can leak request data

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Delete leftover `console.log`, `console.debug` and `console.trace` calls in `server/api`, `server/routes` and `server/middleware` handlers, especially ones that print request data, user ids, emails or addresses (PII). If the message reports a degraded path or a failure someone must act on, keep it as `console.warn` or `console.error` with a fixed prefix and no personal data. Do not add a logging library just for this.

---

*Rule source: [`vue-doctor/server/server-no-console-in-handler`](https://github.com/remylagerweij/vue-doctor)*
