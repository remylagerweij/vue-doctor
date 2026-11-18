# CLI usage

```bash
vue-doctor [directory] [options]
```

`directory` defaults to the current directory.

## Common invocations

```bash
# Scan the current directory
vue-doctor

# Scan a specific project (or workspace projects, comma-separated)
vue-doctor --project ./my-vue-app

# Print only the score number
vue-doctor --score

# Show file details for every finding
vue-doctor --verbose

# Skip dead code detection / skip lint
vue-doctor --no-dead-code
vue-doctor --no-lint

# Only scan files changed against a branch (includes untracked files)
vue-doctor --diff main

# Machine-readable output (see the report format reference)
vue-doctor --format json
vue-doctor --format jsonl --output vue-doctor.jsonl
```

## Fixing findings

```bash
# Preview the fixes as a unified diff (stdout); nothing is written and no scan runs
vue-doctor --fix --dry-run

# Write the fixes, then scan and report on the fixed code
vue-doctor --fix
```

`--fix` first analyses the project with the lint and template passes, using the project config, suppression comments and `--diff` like a normal scan (dead code, project checks, the audit and the baseline are not involved). It then rewrites only the code at the reported locations of the rules marked fixable (`vue-doctor rules` shows `[fixable]`):

| Rule | Fix |
|------|-----|
| `vue-doctor/bundle-size/no-full-lodash-import` | `import { debounce, pick as p } from "lodash"` becomes one `import debounce from "lodash/debounce.js"` per method. Default and namespace imports and inline `type` specifiers are left for you. |
| `vue/no-template-target-blank` | Adds `rel="noopener noreferrer"` after `target="_blank"` on `<a>` tags, or completes an existing static `rel`. Links with a dynamic `:rel` or `v-bind="..."` are left for you. |

Code that is suppressed, belongs to a disabled rule, lies outside the `--diff` files or was not reported is never changed, and running `--fix` again changes nothing. Every project is analysed before any file is written, each file is replaced atomically, and files that resolve outside the project directory are skipped. Missing `v-for` keys and `[...items].sort()` (`js-tosorted-immutable`) are not fixed automatically: a correct key is an identity from your data, and `toSorted` throws on a Set or string and needs an ES2023 `lib`, which a codemod cannot know. `--fix` cannot be combined with `--no-lint`.

## Output streams

Banner, spinners, hints and warnings are written to stderr. stdout contains only the report, so it is safe to pipe or redirect. `--format json` (alias `--json`) always prints one [report document](/reference/report) with a `projects` array, also for a single project.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | OK |
| `1` | A gate was breached (`--fail-on` or `--min-score`) |
| `2` | Usage or configuration error, no Vue project found, or a cancelled prompt |
| `3` | An analyzer failed to run and `--strict` was set |

The full list of flags is in the [CLI reference](/reference/cli). Using these in pipelines is covered in [CI](/guide/ci).
