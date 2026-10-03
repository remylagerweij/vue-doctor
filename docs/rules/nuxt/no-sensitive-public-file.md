# `vue-doctor/nuxt/no-sensitive-public-file`

> Everything in `public/` (and Nuxt's `static/`) is deployed and downloadable by anyone: move secrets, dumps, keys and logs out of it and delete source maps and backups from the folder

| Property | Value |
|---|---|
| **Category** | Nuxt |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `fs` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-200, CWE-538 |
| **OWASP** | A05:2021 |

## Why it matters

Everything in `public/` (and Nuxt's `static/`) is deployed and downloadable by anyone: move secrets, dumps, keys and logs out of it and delete source maps and backups from the folder

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Move the flagged file out of `public/` (or `static/`): secrets and keys belong in the server environment or a secret store, never in the web root; delete backups, logs, dumps and OS files (add them to .gitignore). For `.env`, private keys and database dumps, treat the contents as leaked if the site was ever deployed with the file: tell the user to rotate them, and do not print their content. For source maps, build with `sourcemap: false` for production (or upload them to the error tracker and do not copy them to the web root).

---

*Rule source: [`vue-doctor/nuxt/no-sensitive-public-file`](https://github.com/remylagerweij/vue-doctor)*
