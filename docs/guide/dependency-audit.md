# Dependency audit

The dependency audit checks the package versions installed by your lockfile against [OSV.dev](https://osv.dev), the open vulnerability database that aggregates GitHub Security Advisories (GHSA), the npm advisory feed and others. It reports each vulnerable package as a finding of the rule `vue-doctor/supply-chain/vulnerable-dependency`.

It is the one Vue Doctor feature that uses the network, so it is **off by default**.

## Turn it on

```bash
npx @remylagerweij/vue-doctor . --audit
```

or in `vue-doctor.config.*`:

```ts
export default {
  audit: { enabled: true },
};
```

`--audit` and `audit.enabled` are the only ways to enable it; without them Vue Doctor makes no network call at all.

## Offline mode always wins

With `--offline` (or `VUE_DOCTOR_OFFLINE=1`) the audit does not run, even when you enabled it: it is reported as a skipped analyzer ("dependency audit") with the reason, no request is made, and `--strict` turns the skip into exit code `3`. This makes it safe to keep `audit.enabled` in the project config and still run fully offline in air-gapped CI.

## What is sent

Only the package names and versions from the lockfile, in OSV's `querybatch` API (`POST https://api.osv.dev/v1/querybatch`, at most 1000 versions per request), followed by one `GET https://api.osv.dev/v1/vulns/<id>` per distinct advisory that applies. No file paths, no source code, no project name.

Answers are cached for 24 hours per `name@version` and per advisory, in the same cache directory as the analysis cache (`node_modules/.cache/vue-doctor`, or `VUE_DOCTOR_CACHE_DIR`; never inside your sources). `--no-cache` disables it. Requests time out after 20 seconds and are retried once; when OSV cannot be reached the audit is skipped with the reason and everything else still runs.

## Supported lockfiles

| Lockfile | Notes |
| --- | --- |
| `package-lock.json`, `npm-shrinkwrap.json` | Lockfile versions 1, 2 and 3 |
| `pnpm-lock.yaml` | Lockfile versions 6 and 9 |
| `yarn.lock` | Classic (v1) and Berry (v2+); workspace, patch and git entries are skipped |
| `bun.lock` | Text lockfile. The binary `bun.lockb` cannot be read: the audit is skipped with a hint to use `bun install --save-text-lockfile` |

The lockfile in the project directory is used; in a monorepo, a workspace falls back to the lockfile at the monorepo root (findings then point at `../../<lockfile>`). Each distinct `name@version` is checked once, and each is reported once, marked as a direct or a transitive dependency (direct = declared in `package.json`). Packages that do not come from the npm registry (git, file, link, workspace) are not checked.

## What a finding says

```
lodash@4.17.15 (direct dependency) has 2 known vulnerabilities, highest severity high —
GHSA-35jh-r3h4-6jhm (CVE-2021-23337), GHSA-p6mc-m468-83gw (CVE-2020-8203): Command Injection in lodash; fixed in 4.17.21
```

The finding sits on the package's entry in the lockfile (line of the entry when it can be found). Severity comes from the advisory's CVSS v3 score (critical 9.0+, high 7.0+, moderate 4.0+, low), else from the severity label of the advisory database, else it is `unknown`. "Fixed in" is the lowest version that fixes every listed advisory; when OSV knows no fix it says so.

## Severity and scoring

The rule is a `warning` in the **Supply Chain** category (`vue-doctor/supply-chain/*`), also included in the `vue-doctor/security` preset. It is deliberately not an `error`: Vue Doctor reserves `error` for rules that reliably indicate a bug or a security hole in your own code, and an installed vulnerable version is not necessarily reachable in your app. Like every warning it costs 0.75 score points per unique rule, however many packages are affected, and it never triggers the security score cap.

To gate CI on it, promote it:

```ts
export default {
  audit: { enabled: true },
  rules: { "vue-doctor/supply-chain/vulnerable-dependency": "error" },
};
```

and run `vue-doctor . --audit --fail-on error`. Findings work with the rest of the toolchain: `ignore.rules`, `ignore.files`, baselines (`vue-doctor baseline`, to adopt the audit on a project with known advisories) and every report format. With `--diff`, findings are only reported when the lockfile itself changed.

## Fixing findings

Upgrade the package to the fixed version with your package manager (never by editing the lockfile). For a transitive dependency upgrade the direct dependency that pulls it in, or pin it with `overrides` (npm), `pnpm.overrides` or `resolutions` (Yarn) when no newer parent exists.
