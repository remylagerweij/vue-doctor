# `vue-doctor/security/llm-prompt-injection`

> Do not concatenate untrusted user input directly into system prompts or instructions (prompt injection risk)

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-20 |
| **OWASP** | LLM01:2025 |

## Why it matters

Do not concatenate untrusted user input directly into system prompts or instructions (prompt injection risk)

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Keep system prompts and developer instructions fixed or parameterized via distinct message roles (`{ role: 'user', content: userInput }` rather than interpolating into `{ role: 'system' }`). Always configure output length boundaries (`max_tokens` / `maxTokens`) and input validation for AI/LLM endpoints.

---

*Rule source: [`vue-doctor/security/llm-prompt-injection`](https://github.com/remylagerweij/vue-doctor)*
