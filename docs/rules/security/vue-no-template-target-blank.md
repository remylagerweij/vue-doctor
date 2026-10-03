# `vue/no-template-target-blank`

> Add `rel="noopener noreferrer"` to links that use `target="_blank"`

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `eslint-template` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-1022 |

## Why it matters

Add `rel="noopener noreferrer"` to links that use `target="_blank"`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Add `rel="noopener noreferrer"` to every link with `target="_blank"`.

---

*Rule source: [`vue/no-template-target-blank`](https://github.com/remylagerweij/vue-doctor)*
