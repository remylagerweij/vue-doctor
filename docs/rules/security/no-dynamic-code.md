# `vue-doctor/security/no-dynamic-code`

> Do not turn strings into code: pass a function to `setTimeout`, replace `new Function` with a lookup table, and use SFC templates or render functions instead of runtime-compiled templates

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-95 |
| **OWASP** | A03:2021 |

## Why it matters

Do not turn strings into code: pass a function to `setTimeout`, replace `new Function` with a lookup table, and use SFC templates or render functions instead of runtime-compiled templates

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Remove code built from strings (`eval` itself is reported by `no-eval`). Replace `new Function(...)` with a function map or a safe expression parser; pass a function, not a string, to `setTimeout`/`setInterval` (`setTimeout(() => run(), 100)`); replace runtime template compilation (`compile(template)` from `vue`, `Vue.compile`, a non-literal `template:` option) with single-file components or render functions. A template that is a fixed string literal is not reported. Never compile a template that contains user input: that is client-side template injection (XSS).

---

*Rule source: [`vue-doctor/security/no-dynamic-code`](https://github.com/remylagerweij/vue-doctor)*
