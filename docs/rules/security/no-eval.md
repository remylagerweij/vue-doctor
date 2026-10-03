# `vue-doctor/security/no-eval`

> Replace `eval()` with a safe alternative: `JSON.parse()` for data, or a lookup table of functions for dynamic behaviour

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `error` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-95 |
| **OWASP** | A03:2021 |

## Why it matters

Replace `eval()` with a safe alternative: `JSON.parse()` for data, or a lookup table of functions for dynamic behaviour

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Remove `eval()`. Use `JSON.parse` for data, a lookup table or function map for dynamic dispatch, and never build code from strings.

---

*Rule source: [`vue-doctor/security/no-eval`](https://github.com/remylagerweij/vue-doctor)*
