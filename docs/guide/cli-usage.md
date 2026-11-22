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

# Only report findings on the lines changed against a branch
vue-doctor --diff main --diff-lines

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

## Changed files and changed lines

`--diff [branch]` scans the files changed against the merge base with `branch` (or the default branch, or the uncommitted changes when you are on it), including staged, unstaged and untracked files, and reports every finding in those files.

`--diff-lines` (implies `--diff`; config key `diffLines`) keeps only the findings a change introduces:

- A finding is reported when the line it starts on was added or modified versus the same merge base (a zero-context `git diff`, so committed, staged and unstaged edits all count).
- New files (added or untracked) count as fully changed. A renamed file is compared with its old path, so a pure rename has no changed lines. Deleted and binary files are ignored.
- A diff scan only analyses changed source files (`.vue`, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`). Dead-code analysis (knip) is skipped, and findings on non-source files such as `.env`, lockfiles or `package.json` (including the dependency audit) never appear, even when those files changed. What remains are lint and template findings, which are filtered by line, and filesystem-rule findings that point at a changed source file; a finding without a line is kept whenever its file changed.
- Findings off the changed lines are dropped before the baseline, the score and the gate: the text report, the JSON report and `--fail-on`/`--min-score` all see the same findings. The score is therefore the score of the change, not of the project, and is not comparable to a full scan. The JSON report marks this with `scope.changedLinesOnly: true` and counts what was left out in `scope.outsideChangedLines`; the text report prints the same count.
- Outside a git repository `--diff-lines`, like `--diff`, warns and falls back to a full scan.

In the config file, `diffLines: true` only refines a diff scan of the scan command (`diff` or `--diff`); it never turns diff mode on by itself, and `vue-doctor ci run` does not read it.

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
