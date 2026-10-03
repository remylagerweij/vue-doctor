# CLI Reference

The `vue-doctor` command-line interface diagnoses, scores, and fixes Vue.js and Nuxt applications.

## Global Usage

```bash
npx @remylagerweij/vue-doctor@latest [directory] [options]
```

## Commands

| Command | Description |
|---|---|
| `vue-doctor [directory]` | Default command: scan and diagnose project(s) |
| `vue-doctor ci <subcommand>` | CI runner, PR feedback, and workflow management |
| `vue-doctor baseline [directory]` | Record current findings into a baseline file |
| `vue-doctor init [directory]` | Interactive wizard to set up configuration and CI |
| `vue-doctor rules` | List all registered diagnostic rules and severities |
| `vue-doctor explain <ruleId>` | View full rule documentation and agent guidance |
| `vue-doctor agents install` | Install AI agent instructions (Claude, Cursor, Copilot, etc.) |
| `vue-doctor mcp` | Launch Model Context Protocol (MCP) server over stdio |

---

## Scan Options

- `--format <format>`: Output format. Choices: `text`, `json`, `jsonl`, `sarif`, `github`, `markdown`, `html`. Default: `text`.
- `--json`: Alias for `--format json`.
- `--score`: Print only the numeric health score (0–100) and exit.
- `--output <file>`: Write formatted output to file instead of stdout.
- `--diff [branch]`: Only scan files changed compared to git base branch or working tree.
- `--fix`: Automatically apply deterministic codemods to source files.
- `--dry-run`: Show unified diff of fixes without writing to disk.
- `--fail-on <severity>`: Gate threshold (`none`, `error`, `warning`). Default: `none`.
- `--gate <scope>`: Gate scope (`all` or `new`). Default: `all`.
- `--min-score <score>`: Fail gate if score is below this threshold (0–100).
- `--strict`: Exit with code 3 if any analyzer fails or is skipped.
- `--baseline <file>`: Path to baseline file to suppress known issues.
- `--audit`: Enable OSV.dev dependency vulnerability checks.
- `--offline`: Guarantee zero network calls.
- `--no-lint`: Skip AST and template lint checks.
- `--no-dead-code`: Skip Knip dead code analysis.
- `--no-cache`: Disable content-hash cache in `node_modules/.cache/vue-doctor`.

---

## Exit Codes

| Code | Name | Description |
|---|---|---|
| `0` | **OK** | Scan finished and all gates passed. |
| `1` | **Gate Breached** | Findings exceeded `--fail-on` or score fell below `--min-score`. |
| `2` | **Usage Error** | Invalid command syntax, missing dependencies, or bad config. |
| `3` | **Analyzer Failure** | An analyzer failed or was skipped with `--strict` enabled. |
