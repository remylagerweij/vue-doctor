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

## Options

Set options next to the severity: `"vue-doctor/server/auth-missing": ["warn", { ... }]`.

| Option | Type | Description |
|---|---|---|
| `authFunctions` | string[] | Names of project functions that authenticate the request, e.g. `["ensureAdmin"]`. Calling one counts as an auth check. In a scan, `server/utils` functions that read the session and throw a 401/403 are added automatically. |

## Agent Guidance

Admin routes (`server/api/admin/**`) and mutating endpoints (`.post`, `.put`, `.delete`, `.patch`) should enforce an authentication check (e.g. `await requireUserSession(event)`, `await getServerSession(event)`, or custom middleware setting `event.context.auth`). Guards named like `requireAdmin`/`ensureUser`/`assertOrgMember`, and `server/utils` functions that read the session and throw a 401/403, are recognised; list other project guards in the rule's `authFunctions` option. If the endpoint is intentionally public (such as `login.post.ts` or `register.post.ts`), suppress this advisory with `// vue-doctor-disable-next-line`.

---

*Rule source: [`vue-doctor/server/auth-missing`](https://github.com/remylagerweij/vue-doctor)*
