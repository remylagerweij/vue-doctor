# `vue-doctor/supply-chain/vulnerable-dependency`

> Upgrade the dependency to a fixed version (see the advisory), or replace it; run your package manager's update, then re-run the audit

| Property | Value |
|---|---|
| **Category** | Supply Chain |
| **Default Severity** | `warning` |
| **Confidence** | high |
| **Fixable** | No |
| **Engine** | `audit` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-1395 |
| **OWASP** | A06:2021 |

## Why it matters

Upgrade the dependency to a fixed version (see the advisory), or replace it; run your package manager's update, then re-run the audit

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

Upgrade the named package to the fixed version in the message using the project's package manager (npm/pnpm/yarn/bun update or install name@version), and regenerate the lockfile through the package manager, never by editing it by hand. For a transitive dependency, upgrade the direct dependency that pulls it in, or add an `overrides`/`resolutions` entry only when no newer parent exists. Run the tests afterwards. If no fixed version exists, say so instead of silencing the finding.

---

*Rule source: [`vue-doctor/supply-chain/vulnerable-dependency`](https://github.com/remylagerweij/vue-doctor)*
