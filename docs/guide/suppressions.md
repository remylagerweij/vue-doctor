# Suppressing findings

Vue Doctor has its own suppression comments. `eslint-disable` and `oxlint-disable` comments do **not** hide Vue Doctor findings, and Vue Doctor never modifies your files.

```ts
// vue-doctor-disable-next-line vue-doctor/bundle-size/no-moment -- legacy report page
import moment from "moment";
const html = render(); // vue-doctor-disable-line
/* vue-doctor-disable vue-doctor/bundle-size/no-moment */ /* vue-doctor-enable vue-doctor/bundle-size/no-moment */
// vue-doctor-disable-file no-giant-component
```

| Directive | Scope |
|-----------|-------|
| `vue-doctor-disable-next-line` | The following line |
| `vue-doctor-disable-line` | The line it is on |
| `vue-doctor-disable` / `vue-doctor-enable` | A region |
| `vue-doctor-disable-file` | The whole file |

Add an optional reason after `--`. Without a rule list every rule is suppressed. Rules are written as canonical IDs (`vue-doctor/<category>/<rule>`, `vue/<rule>`; a trailing `/*` selects a group). The 1.x forms `rule` and `vue-doctor/rule` still work, with one deprecation warning per ID per run.

## In templates

In `.vue` templates use HTML comments:

```vue
<!-- vue-doctor-disable-next-line vue-doctor/security/no-unsafe-html-sink -->
<div v-html="trustedHtml" />
```

## In `.env` files

Findings of the project checks that point into a `.env*` file (for example `vue-doctor/security/no-secret-in-public-env-file`) are suppressed with a `#` comment:

```dotenv
# vue-doctor-disable-next-line vue-doctor/security/no-secret-in-public-env-file -- the key is restricted to this origin
VITE_MAPS_SECRET_KEY=...
```

## Auditing: ignore inline disables

For a security or quality audit you want to see every finding, whatever developers silenced. Run with `--no-inline-disables` (programmatic API: `diagnose(dir, { inlineDisables: false })`; MCP `scan` tool: `ignore_inline_disables: true`):

```bash
vue-doctor --no-inline-disables
```

- Every `vue-doctor-disable*` comment is ignored, in scripts, templates and `.env` files. The findings they would have hidden are reported like any other finding, so they count toward the score, `--fail-on` and `--min-score`. Exit codes do not change.
- The report never claims anything was suppressed (`suppressed` is 0). Instead the text output prints how many findings the comments would have hidden, and the JSON, Markdown and HTML reports carry `inlineDisables: { ignored: true, unsuppressed: { count, byRule } }`.
- This is **not** a config option. Whether to trust a project's own comments is the auditor's decision for a run, not something the audited repository should be able to switch (or switch back) for itself, so the switch lives on the command line, the API and the MCP tool only.
- Only inline comments are ignored. The `ignore.rules` and `ignore.files` entries of the config, `rules` severity overrides and [baselines](/guide/baseline) are not inline disables and stay in force: a rule ignored in the config is still not reported. To audit those too, scan with `config: null` / without the config file and without `--baseline`.
- The analysis cache is not affected. It stores findings before suppression is applied, so runs with and without the flag can share it and never return each other's results.
- `eslint-disable` and `oxlint-disable` comments are ignored in every mode, as before.

Programmatic results from `diagnose()` include `suppressed: { count, byRule }` and `foreignDirectives` (ESLint/oxlint directives that were ignored). With `inlineDisables: false` they also include `unsuppressed` (the findings the comments would have hidden, which are part of `diagnostics`).
