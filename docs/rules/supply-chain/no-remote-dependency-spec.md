# `vue-doctor/supply-chain/no-remote-dependency-spec`

> Depend on a version published to the registry; if you need a fork, publish it (scoped) or pin the git dependency to a full commit hash

| Property | Value |
|---|---|
| **Category** | Supply Chain |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `fs` |
| **Since** | v2.0.0 |
| **Frameworks** | vue, nuxt |
| **CWE** | CWE-829, CWE-494 |
| **OWASP** | A08:2021 |

## Why it matters

Depend on a version published to the registry; if you need a fork, publish it (scoped) or pin the git dependency to a full commit hash

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

For each flagged dependency in package.json, replace the git/tarball/http spec with a version range from the registry when the package is published there. If it is an unpublished fork, either publish it under a scope or pin the git spec to a full 40-character commit hash (`github:user/repo#<sha>`). Never switch an `http://` URL to a different host; use `https://` or the registry. Re-run the install command so the lockfile follows.

---

*Rule source: [`vue-doctor/supply-chain/no-remote-dependency-spec`](https://github.com/remylagerweij/vue-doctor)*
