# `vue-doctor/server/no-leaky-error-rethrow`

> Do not send a caught error's message to the client, and let HTTP errors through a catch block instead of turning them into a 500

| Property | Value |
|---|---|
| **Category** | Server |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.1.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-209 |
| **OWASP** | A04:2021 |

## Why it matters

Do not send a caught error's message to the client, and let HTTP errors through a catch block instead of turning them into a 500

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Nitro already turns an unhandled error into a generic 500 and logs its stack, so a handler does not need a try/catch to be safe. When it has one: (1) never put `error.message` of a caught error or of a Supabase/Prisma `{ error }` result into `createError({ statusMessage | message })`, because the client receives it and it can name tables, constraints or internal hosts; log it with `console.error("[Tag] ...", error)` and throw a fixed, generic `statusMessage`. (2) Rethrow HTTP errors before wrapping: `throw isError(error) ? error : createError({ statusCode: 500, statusMessage: "..." })` (h3 `isError`), so a 400/401/403/404 thrown in the try block keeps its status.

---

*Rule source: [`vue-doctor/server/no-leaky-error-rethrow`](https://github.com/remylagerweij/vue-doctor)*
