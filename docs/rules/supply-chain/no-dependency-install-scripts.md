# `vue-doctor/supply-chain/no-dependency-install-scripts`

> Review dependencies that run code at install time and record the decision: npm `allowScripts` (`npm approve-scripts`), pnpm `onlyBuiltDependencies`, Bun `trustedDependencies`

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

Review dependencies that run code at install time and record the decision: npm `allowScripts` (`npm approve-scripts`), pnpm `onlyBuiltDependencies`, Bun `trustedDependencies`

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Do not remove the dependency just because it has an install script: many native packages need one. Check that the package is the one intended (name, publisher, download count), then record the review in the package manager's allowlist, which silences the finding: npm 11 `allowScripts` in package.json (`npm approve-scripts <pkg>`), pnpm `onlyBuiltDependencies`, Bun `trustedDependencies`. Scripts that only `echo` or `exit 0` are not reported. Report the list to the user rather than silently changing install behaviour.

---

*Rule source: [`vue-doctor/supply-chain/no-dependency-install-scripts`](https://github.com/remylagerweij/vue-doctor)*
