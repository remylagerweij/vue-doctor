# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 2.x | ✅ Security fixes |
| 1.x | ❌ Please upgrade to 2.x |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Report a vulnerability** on
[remylagerweij/vue-doctor](https://github.com/remylagerweij/vue-doctor/security/advisories/new).

Include the affected version, a description, and a minimal reproduction if you have one.
You can expect an acknowledgement within 5 working days and a fix or mitigation plan within 30 days.
We credit reporters in the release notes unless you prefer to stay anonymous.

## Threat model

Vue Doctor is a static analysis tool, but **scanning a project is not side-effect free**. Treat
"scan this repository" the same as "run this repository's code".

### Scanning executes project code

- **Dead-code analysis (knip) loads the project's config files**, such as `vite.config.*`,
  `nuxt.config.*`, `vitest.config.*` and other plugin configs, by evaluating them (TypeScript
  through jiti). A malicious config file runs with the permissions of whoever runs the scan.
- **`vue-doctor.config.ts` / `.js` is evaluated** when present, and only from the project root.

Consequences:

- Only scan repositories you would also be willing to `npm install` and build.
- In CI, **never run Vue Doctor under `pull_request_target`** (or any trigger with a write token or
  secrets) on a checkout of untrusted pull-request code. Vue Doctor refuses to run in that context
  unless you pass an explicit override flag. Use `pull_request` and, for fork PR comments, the
  two-stage `workflow_run` pattern described in the CI documentation, which never checks out PR code
  with a write token.

### What Vue Doctor guarantees

- **It never writes inside the scanned project** unless you ask it to (`--fix`, `baseline`,
  `ci install`, `agents install`, or an explicit `--output` path).
- **No network access by default.** The only network feature is the opt-in dependency audit
  (OSV.dev). `--offline` guarantees zero network requests.
- **No telemetry.**
- **Secrets are masked.** When a hardcoded secret is detected, its value never appears in any
  output format (terminal, JSON, SARIF, Markdown, PR comments or agent prompts).
- **No shell interpolation.** Analyzers run in-process or are spawned with argument arrays, so file
  names from git can't inject shell commands.
- **Temporary files** are created in a private `mkdtemp` directory with owner-only permissions.

### Supply chain

- Releases are published from GitHub Actions with **npm provenance** (trusted publishing).
- All third-party GitHub Actions are pinned by commit SHA.
- The GitHub Action runs the CLI version that matches the action's own release tag, never `@latest`.
