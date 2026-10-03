# `vue-doctor/security/no-llm-sdk-in-client`

> Call the LLM provider from a server route (Nuxt `server/api/*` or your backend) and keep its API key in a non-public environment variable or `runtimeConfig`

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-522, CWE-200 |
| **OWASP** | A05:2021 |

## Why it matters

Call the LLM provider from a server route (Nuxt `server/api/*` or your backend) and keep its API key in a non-public environment variable or `runtimeConfig`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Code that runs in the browser must not call an LLM provider directly: the API key it needs ships to every visitor, who can then spend your quota. Move the provider SDK (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `@ai-sdk/<provider>`, ...) or the request to `api.openai.com` / `api.anthropic.com` / ... into a server route (Nuxt `server/api/chat.post.ts`, or a backend), read the key there from `process.env` or the non-public part of `runtimeConfig`, and have the client call that route (`$fetch('/api/chat')`, or `useChat` from `@ai-sdk/vue`). Remove `dangerouslyAllowBrowser: true`. If a key was already shipped, revoke and rotate it. Type-only imports (`import type`) are fine.

---

*Rule source: [`vue-doctor/security/no-llm-sdk-in-client`](https://github.com/remylagerweij/vue-doctor)*
