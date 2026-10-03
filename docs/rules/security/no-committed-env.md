# `vue-doctor/security/no-committed-env`

> Do not commit `.env` files with secrets: untrack the file, add it to .gitignore, rotate the secrets and commit a `.env.example` without values

| Property | Value |
|---|---|
| **Category** | Security |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `fs` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-538 |
| **OWASP** | A05:2021 |

## Why it matters

Do not commit `.env` files with secrets: untrack the file, add it to .gitignore, rotate the secrets and commit a `.env.example` without values

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Run `git rm --cached <file>` to stop tracking the file (keep it on disk), add `.env` and `.env.*` (with `!.env.example`) to .gitignore, and commit a `.env.example` that lists the variable names without values. Treat every secret in the file as leaked, since it stays in git history: rotate it, and tell the user that history cleaning (git filter-repo) is their decision. Never print the values.

---

*Rule source: [`vue-doctor/security/no-committed-env`](https://github.com/remylagerweij/vue-doctor)*
