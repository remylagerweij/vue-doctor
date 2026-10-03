# Rules

Vue Doctor ships custom oxlint rules plus a curated set of `eslint-plugin-vue` template rules.

::: info Work in progress
Individual rule pages (why it matters, bad and good examples, fix, options) will be generated from the rule registry in a later release. Until then this page lists the categories.
:::

## Rule IDs

Every rule has one public ID, used in findings, `--format json` output, baselines, config and suppression comments:

| Rules | ID shape | Example |
|-------|----------|---------|
| Vue Doctor's own rules | `vue-doctor/<category>/<rule>` | `vue-doctor/security/no-eval`, `vue-doctor/bundle-size/no-moment` |
| Template rules (eslint-plugin-vue) | `vue/<rule>` | `vue/require-v-for-key` |
| Dead code (knip) | `knip/<type>` | `knip/files` |

`<category>` is the kebab-case category name: `reactivity`, `ecosystem`, `architecture`, `performance`, `security`, `supply-chain`, `bundle-size`, `correctness`, `nuxt`, `server`.

A trailing `/*` selects a whole group, in `rules` and `ignore.rules`: `vue-doctor/security/*`, `vue-doctor/*`, `vue/*`.

::: warning Deprecated 1.x IDs
The 1.x forms `no-eval` and `vue-doctor/no-eval` (and bare `no-template-target-blank` for template rules) are still accepted in `rules`, `ignore.rules` and suppression comments. They resolve to the canonical rule and print one deprecation warning per distinct ID per run naming the replacement. Switch to the canonical ID; the aliases will be removed in a future major version.
:::

Template rules from `eslint-plugin-vue` (for example `vue/require-v-for-key`, `vue/no-mutating-props` and `vue/no-template-target-blank`) are reported under the same score. To silence a rule see [Suppressing findings](/guide/suppressions) or [Configuration](/guide/configuration).

## Project checks

Some rules look at project files instead of source code, for example whether a `.env.local` is committed, whether a lockfile exists or whether `public/` contains a private key. They run in their own analyzer, "project checks" (engine `fs` in the table below), alongside lint, template and dead-code checks. They only read the project, never use the network, and honour `rules`, `ignore`, baselines and the cache like every other rule. In a git repository they use `git ls-files`; elsewhere they walk the directory. Findings never contain secret values, only variable names and file locations. Skip them with `diagnose(dir, { projectChecks: false })` or silence single rules in the config.

| Rule | What it reports |
|------|-----------------|
| `vue-doctor/security/no-committed-env` | A tracked `.env` file: always for `*.local` files (by convention never committed), otherwise when it sets non-empty values for secret-looking names or known secret formats. `.env.example`, `.sample`, `.template`, `.defaults` are ignored. |
| `vue-doctor/security/no-secret-in-public-env-file` | `VITE_*`, `VUE_APP_*`, `NUXT_PUBLIC_*` and `PUBLIC_*` variables in `.env*` files whose name looks secret (or whose value is in a secret format). Publishable and anon keys are fine. |
| `vue-doctor/security/no-secret-in-public-env` | The same names read in source: `import.meta.env.VITE_*`, `process.env.NUXT_PUBLIC_*`, `useRuntimeConfig().public.*`. |
| `vue-doctor/security/no-llm-sdk-in-client` | LLM provider SDKs (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `@google/genai`, `@ai-sdk/<provider>`, `groq-sdk`, `@mistralai/mistralai`, `cohere-ai`, ...) imported in client code, `dangerouslyAllowBrowser: true`, and `fetch`/`$fetch`/`axios`/`ky` calls to provider API hosts (`api.openai.com`, `api.anthropic.com`, ...). Server code (`server/`, `*.server.*`, config files), tests and type-only imports are fine, as are `useChat` from `@ai-sdk/vue` and requests to your own `/api/chat`. A warning, since a configured proxy URL would not expose a key. |
| `vue-doctor/nuxt/no-secret-in-public-runtime-config` | Secret-looking keys (or secret-format values) under `runtimeConfig.public` in `nuxt.config`, and in `app.config`, which is entirely public. |
| `vue-doctor/nuxt/no-sensitive-public-file` | Files in `public/` (and Nuxt `static/`) that are deployed to the web root: `.env*`, private keys (`*.pem`, `*.key`, `id_rsa*`), database files and dumps (`*.sql`, `*.sqlite`, `*.db`), source maps, backups (`*.bak`, `*.old`, `*~`), logs, `.DS_Store` and a `.git/` folder. Untracked and git-ignored files count, since they are deployed too. |
| `vue-doctor/supply-chain/lockfile-integrity` | No lockfile for a project with dependencies (looked up in the monorepo root too), lockfiles of several package managers side by side, and packages in the lockfile resolved from a host other than the configured registry (`registry.npmjs.org` by default, plus `registry=` and `@scope:registry=` of `.npmrc` and `npmRegistryServer` of `.yarnrc.yml`). Reads npm, pnpm and Yarn classic lockfiles. |
| `vue-doctor/supply-chain/no-remote-dependency-spec` | `package.json` dependencies installed from a git repository, an `http://` URL or a tarball URL instead of the registry. Git dependencies pinned to a full commit hash are fine. |
| `vue-doctor/supply-chain/no-dependency-install-scripts` | Direct dependencies that run `preinstall`, `install` or `postinstall` scripts (npm lockfile `hasInstallScript`, pnpm `requiresBuild`). A low-confidence warning: many native packages need one, the point is to know which code runs at install time. |

The secret-name rules are medium-confidence signals, so they are warnings. The same goes for the supply-chain and public-file rules: they cannot know whether a mirror, a git dependency or a file in `public/` is intended. Bare `apiKey` names (Firebase, Maps and analytics keys are public by design) are only reported with a qualifier such as `secret`, `private` or a provider like `openai`.

## Severity policy

A rule defaults to `error` only when it is a Security rule with high confidence or a Correctness rule that reliably indicates a bug. Every other rule (performance, reactivity, architecture, bundle size, Nuxt, server, ecosystem, dead code, and medium or low confidence security rules) defaults to `warning`. Errors weigh more than warnings in the score, so a project is not marked down hard for style or optimisation advice. Override any rule with the [`rules` config](/guide/configuration).

## All rules

This table is generated from the rule registry.

<!--@include: ./table.md-->
