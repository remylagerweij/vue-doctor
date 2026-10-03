# `vue-doctor/security/postmessage-origin-check`

> Check `event.origin` against an allowlist before using `event.data`, and pass an explicit target origin to `postMessage`

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-346 |
| **OWASP** | A01:2021 |

## Why it matters

Check `event.origin` against an allowlist before using `event.data`, and pass an explicit target origin to `postMessage`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

In every `message` listener, verify the sender first: `if (event.origin !== "https://trusted.example") return;` (compare against an exact origin or an allowlist, never `includes`/`startsWith`) before reading `event.data`; checking `event.source === iframe.contentWindow` also counts. When sending, pass the receiver's exact origin as the second argument of `postMessage`, never `"*"` for tokens, sessions or personal data.

---

*Rule source: [`vue-doctor/security/postmessage-origin-check`](https://github.com/remylagerweij/vue-doctor)*
