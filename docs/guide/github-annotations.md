# GitHub annotations

`--format github` prints [GitHub Actions workflow commands](https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions), one per finding. GitHub turns them into annotations on the changed lines of a pull request ("Files changed" tab) and in the workflow run summary. Unlike [SARIF upload](/guide/code-scanning), this needs no extra permission, so it also works on pull requests from forks.

```bash
vue-doctor . --format github
```

```
::error file=src/App.vue,line=12,col=3,endLine=12,endColumn=40,title=vue-doctor/security/no-unsafe-html-sink::v-html with dynamic content can lead to XSS.%0AOnly render sanitized HTML.%0ADocs: https://remylagerweij.github.io/vue-doctor/rules/security/no-unsafe-html-sink
```

## Workflow

```yaml
name: Vue Doctor
on:
  pull_request:

jobs:
  vue-doctor:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx vue-doctor@latest . --format github
```

The command exits with the usual [exit codes](/guide/ci), so a failed gate still fails the step. To write the annotations to a file first, add `--output vue-doctor.annotations.txt` and `cat` it in a later step; workflow commands are only interpreted when printed to the step's stdout.

## What is emitted

- Errors become `::error`, warnings `::warning`. Low-confidence warnings become `::notice`, like the `note` level of SARIF.
- `file` is the repository-relative POSIX path. When you scan a subdirectory of the repository (for example `vue-doctor apps/web --format github`) the path from the repository root is added, so annotations land on the right file.
- `line`, `col`, `endLine` and `endColumn` are set when known; findings about a whole file have none.
- `title` is the rule ID. The message is the finding message, the short fix hint and the documentation URL.
- No source code is printed, only the finding's text, so a secret in your code does not reach the log.
- Values are escaped as GitHub's toolkit does (`%`, newlines, and for properties also `:` and `,`). A message or file name containing `::add-mask::` or newlines can never start another workflow command.

## Limits

GitHub shows at most 10 error, 10 warning and 10 notice annotations per step, and 50 per job; the rest are only in the step log. Vue Doctor prints every finding, ordered errors first, then warnings, then notices. When a level exceeds 10, a final `::notice` line states the number of findings and how to see all of them. Use [SARIF](/guide/code-scanning) or `--format json` when you need the complete list.

Annotations appear on a pull request only for lines that are part of its diff. Use `--diff <base-branch>` to scan just the changed files.
