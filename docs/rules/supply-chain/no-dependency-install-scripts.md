# `vue-doctor/supply-chain/no-dependency-install-scripts`

> Review dependencies that run code at install time; install with --ignore-scripts and allow-list the ones that need it (pnpm `onlyBuiltDependencies`)

| Property | Value |
|---|---|
| **Category** | Supply Chain |
| **Default Severity** | `warning` |
| **Confidence** | low |
| **Fixable** | No |
| **Engine** | `fs` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-829 |
| **OWASP** | A08:2021 |

## Why it matters

Review dependencies that run code at install time; install with --ignore-scripts and allow-list the ones that need it (pnpm `onlyBuiltDependencies`)

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not remove the dependency just because it has an install script: many native packages need one. Check that the package is the one intended (name, publisher, download count), then restrict install scripts: in pnpm add it to `onlyBuiltDependencies` and nothing else; with npm use `--ignore-scripts` in CI and rebuild only what is needed (`npm rebuild <pkg>`). Report the list to the user rather than silently changing install behaviour.

---

*Rule source: [`vue-doctor/supply-chain/no-dependency-install-scripts`](https://github.com/remylagerweij/vue-doctor)*
