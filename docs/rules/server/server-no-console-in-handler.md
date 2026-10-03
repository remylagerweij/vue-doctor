# `vue-doctor/server/server-no-console-in-handler`

> Use a structured logger like `consola` or `pino` for server-side logging instead of `console.log()`

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

Use a structured logger like `consola` or `pino` for server-side logging instead of `console.log()`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Replace `console.log/info/warn` in server handlers with a structured logger such as `consola` or `pino`; keep the message and add context as fields.

---

*Rule source: [`vue-doctor/server/server-no-console-in-handler`](https://github.com/remylagerweij/vue-doctor)*
