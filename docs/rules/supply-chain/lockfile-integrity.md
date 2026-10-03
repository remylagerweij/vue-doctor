# `vue-doctor/supply-chain/lockfile-integrity`

> Commit exactly one lockfile that belongs to your package manager and make sure every package in it is resolved from your registry

| Property | Value |
|---|---|
| **Category** | Supply Chain |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `fs` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-494, CWE-829 |
| **OWASP** | A08:2021 |

## Why it matters

Commit exactly one lockfile that belongs to your package manager and make sure every package in it is resolved from your registry

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Missing lockfile: run the project's install command (`npm install`, `pnpm install` or `yarn install`) and commit the generated lockfile. Several lockfiles: keep the one of the package manager the project uses (check the `packageManager` field and the CI install step), delete the others and untrack them. Packages from another host: find out why they are there (a private mirror should be listed in `.npmrc`; otherwise reinstall from the default registry) and regenerate the lockfile; do not edit URLs in the lockfile by hand and do not rewrite hosts to make the finding disappear.

---

*Rule source: [`vue-doctor/supply-chain/lockfile-integrity`](https://github.com/remylagerweij/vue-doctor)*
