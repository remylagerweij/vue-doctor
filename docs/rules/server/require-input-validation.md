# `vue-doctor/server/require-input-validation`

> Validate request input with `getValidatedQuery`/`readValidatedBody`/`getValidatedRouterParams` and a schema (zod, valibot), or run `schema.parse()` on it before use

| Property | Value |
|---|---|
| **Category** | Server |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-20 |
| **OWASP** | A03:2021 |

## Why it matters

Validate request input with `getValidatedQuery`/`readValidatedBody`/`getValidatedRouterParams` and a schema (zod, valibot), or run `schema.parse()` on it before use

## How to fix

Review the finding and update the code according to best practices below.

## Options

Set options next to the severity: `"vue-doctor/server/require-input-validation": ["warn", { ... }]`.

| Option | Type | Description |
|---|---|---|
| `validators` | string[] | Names of project functions that validate what they are given, e.g. `["parseBody", "parseQuery"]`. A raw read passed to one counts as validated. |

## Agent Guidance

Replace `getQuery(event)` with `getValidatedQuery(event, schema.parse)`, `readBody(event)` with `readValidatedBody(event, schema.parse)` and `getRouterParam(event, 'id')` with `getValidatedRouterParams(event, schema.parse)` (zod, valibot or arktype schema; a TypeScript generic like `readBody<Foo>(event)` or a cast like `body as Foo` is not validation, it only asserts a type). Or keep the raw read and pass the result through `schema.parse(...)` / `safeParse` before using it, throwing `createError({ statusCode: 400 })` on failure. A route param only needs a presence check that throws (`if (!id) throw createError({ statusCode: 400 })`), since it is always a string. A single header read for authentication or forwarding can be compared against the expected value instead. If the project validates through its own helper (`parseBody(event, schema)`), list it in the rule's `validators` option.

---

*Rule source: [`vue-doctor/server/require-input-validation`](https://github.com/remylagerweij/vue-doctor)*
