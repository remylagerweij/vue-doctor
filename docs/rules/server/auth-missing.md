# `vue-doctor/server/auth-missing`

> Ensure sensitive, admin, or mutating server routes verify authentication or authorization

| Property | Value |
|---|---|
| **Category** | Server |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-862 |
| **OWASP** | A01:2021 |

## Why it matters

Ensure sensitive, admin, or mutating server routes verify authentication or authorization

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Admin routes (`server/api/admin/**`) and mutating endpoints (`.post`, `.put`, `.delete`, `.patch`) should enforce an authentication check (e.g. `await requireUserSession(event)`, `await getServerSession(event)`, or custom middleware setting `event.context.auth`). If the endpoint is intentionally public (such as `login.post.ts` or `register.post.ts`), suppress this advisory with `// vue-doctor-disable-next-line`.

---

*Rule source: [`vue-doctor/server/auth-missing`](https://github.com/remylagerweij/vue-doctor)*
