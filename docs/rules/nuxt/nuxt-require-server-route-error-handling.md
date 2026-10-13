# `vue-doctor/nuxt/nuxt-require-server-route-error-handling` (removed)

This rule was removed in 2.1. It asked every server route to wrap its body in `try/catch` and rethrow `createError({ statusCode, statusMessage })`, which Nitro does not need and which made things worse:

- Nitro already turns an unhandled error into a generic `500` response and logs its stack (`[request error] [unhandled]`); `createError` status codes pass through untouched.
- A blanket `catch` that rethrows a `500` swallows the `400`/`401`/`404` thrown inside the `try` block, and stops Nitro from logging the error as unhandled.
- It encouraged `statusMessage: error.message`, which sends driver messages and internals to the client.

The ID is still accepted in `rules`, `ignore.rules` and suppression comments, with a warning, but selects nothing. Remove it from your config.

Its replacement looks for the actual problems: [`vue-doctor/server/no-leaky-error-rethrow`](/rules/server/no-leaky-error-rethrow).
