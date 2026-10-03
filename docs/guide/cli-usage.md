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
