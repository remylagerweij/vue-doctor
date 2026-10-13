# `vue-doctor/server/csrf-on-mutating-routes`

> Protect state-changing (mutating) API endpoints that authenticate with a session cookie against Cross-Site Request Forgery (CSRF)

| Property | Value |
|---|---|
| **Category** | Server |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v2.0.0 |
| **Frameworks** | nuxt |
| **CWE** | CWE-352 |
| **OWASP** | A01:2021 |

## Why it matters

Protect state-changing (mutating) API endpoints that authenticate with a session cookie against Cross-Site Request Forgery (CSRF)

## How to fix

Review the finding and update the code according to best practices below.

## Options

Set options next to the severity: `"vue-doctor/server/csrf-on-mutating-routes": ["warn", { ... }]`.

| Option | Type | Description |
|---|---|---|
| `sessionFunctions` | string[] | Names of project functions that read the cookie session, e.g. `["requireUser"]`. Calling one makes a route cookie-authenticated. In a scan, `server/utils` functions that call a session reader are added automatically. |
| `sessionCookieSameSite` | `"strict"` \| `"lax"` \| `"none"` | SameSite attribute of the session cookie. In a scan it is read from `nuxt.config` (`@nuxtjs/supabase`, `nuxt-auth-utils` and `@sidebase/nuxt-auth` default to `lax`). With `lax` or `strict` nothing is reported. |
| `csrfProtection` | boolean | The project already rejects cross-site requests for every route. In a scan it is `true` when `nuxt-security` or `nuxt-csurf` is configured, or a `server/middleware` checks `Origin`, `Referer` or `Sec-Fetch-Site`. |
| `reportSameSiteLax` | boolean | Also report routes whose session cookie is `SameSite=Lax`/`Strict`, for apps whose same-site subdomains are not trusted. Default `false`. |

## Agent Guidance

A mutating endpoint (`.post`, `.put`, `.patch`, `.delete`) that authenticates with an ambient session cookie can be called from another site with the user's cookies: h3's `readBody` also parses form-encoded and untyped bodies, which a cross-site form can send without a preflight, so a JSON API is not protected by being JSON. Prefer one guard for all routes: a `server/middleware` that rejects non-GET `/api/**` requests whose `Sec-Fetch-Site` is present and not `same-origin`/`none` (or whose `Origin` is not your site), or `nuxt-security` / `nuxt-csurf`. Per route, compare `getRequestHeader(event, 'origin')` with the expected origin, require `content-type: application/json`, or verify a CSRF token. A session cookie with `SameSite=Lax` or `Strict` already blocks cross-site requests (not those from same-site subdomains); the rule reads that from the auth module's config.

---

*Rule source: [`vue-doctor/server/csrf-on-mutating-routes`](https://github.com/remylagerweij/vue-doctor)*
