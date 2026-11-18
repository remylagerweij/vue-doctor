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

## Changed files and changed lines

`--diff [branch]` scans the files changed against the merge base with `branch` (or the default branch, or the uncommitted changes when you are on it), including staged, unstaged and untracked files, and reports every finding in those files.

`--diff-lines` (implies `--diff`; config key `diffLines`) keeps only the findings a change introduces:

- A finding is reported when the line it starts on was added or modified versus the same merge base (a zero-context `git diff`, so committed, staged and unstaged edits all count).
- New files (added or untracked) count as fully changed. A renamed file is compared with its old path, so a pure rename has no changed lines. Deleted and binary files are ignored.
- File-level findings (dead code, filesystem rules such as a committed `.env`, the dependency audit, and anything without a line) are kept whenever their file changed.
- Findings off the changed lines are dropped before the baseline, the score and the gate: the text report, the JSON report and `--fail-on`/`--min-score` all see the same findings. The score is therefore the score of the change, not of the project, and is not comparable to a full scan. The JSON report marks this with `scope.changedLinesOnly: true` and counts what was left out in `scope.outsideChangedLines`; the text report prints the same count.
- Outside a git repository `--diff-lines`, like `--diff`, warns and falls back to a full scan.

In the config file, `diffLines: true` only refines a diff scan (`diff` or `--diff`); it never turns diff mode on by itself.

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
