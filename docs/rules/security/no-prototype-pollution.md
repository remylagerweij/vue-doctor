# `vue-doctor/security/no-prototype-pollution`

> Prevent prototype pollution: do not assign user-controlled keys without checking for `__proto__`/`constructor`, and avoid deep-merging untrusted input into existing objects

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-1321 |
| **OWASP** | A08:2021 |

## Why it matters

Prevent prototype pollution: do not assign user-controlled keys without checking for `__proto__`/`constructor`, and avoid deep-merging untrusted input into existing objects

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

When assigning to dynamic object properties (`obj[key] = value`) with user-controlled keys, ensure `key !== '__proto__' && key !== 'constructor' && key !== 'prototype'`, or use `Object.create(null)` / `Map` for arbitrary key-value storage. When merging untrusted input, avoid merging into shared or existing prototype-bearing objects.

---

*Rule source: [`vue-doctor/security/no-prototype-pollution`](https://github.com/remylagerweij/vue-doctor)*
