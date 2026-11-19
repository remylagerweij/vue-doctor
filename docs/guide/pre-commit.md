# Pre-commit

There are two ways to check code before it is committed. They cover different amounts, so pick by what you need.

| | Plugin through lint-staged (advisory) | CLI `--diff` in a git hook |
|---|---|---|
| Looks at | Exactly the staged files | Changed files, see below |
| Rules | Script rules only | Everything: script, template, filesystem, dead code, score |
| Speed | Fastest | A full analyzer start for the changed files |
| Setup | Needs the [editor setup](./editor) | `vue-doctor` only |

## What `--diff` scans

`vue-doctor --diff` with no argument does not mean "staged files". It lists changed files this way
(`src/utils/get-diff-files.ts`):

- It looks for a default branch named `main` or `master`. If you are **on** that branch, or neither exists, it scans every file that differs from `HEAD`: staged changes, unstaged changes and untracked files that are
  not ignored.
- If you are on **another branch**, it scans every file changed since the branch left the default branch (the merge
  base), plus staged, unstaged and untracked files. In a hook on a feature branch that is the whole branch, not only the
  commit you are making.
- Only source files (`.vue`, `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`) are scanned; deleted files are skipped.
- `--diff <branch>` compares against that branch instead. If git cannot answer (no repository, no commits, unknown
  ref, shallow clone without a merge base) Vue Doctor warns and runs a **full** scan.
- With nothing to scan it exits `0`.

We checked this on a throwaway repository: on `main` with one staged, two modified and one new file, all four were
scanned; the unstaged ones too. The command does not accept a file list, so it cannot be limited to the staged files.

## Plain git hook

`.git/hooks/pre-commit` (or the same line in Husky, simple-git-hooks or lefthook):

```sh
#!/bin/sh
npx vue-doctor . --diff --fail-on error --no-dead-code --quiet
```

- `--fail-on error` makes the hook exit `1` when an error-level finding exists in the scanned files, which aborts the
  commit. Without a gate the exit code is `0` whatever is found.
- `--no-dead-code` skips Knip, which looks at the whole project and is slow for a hook. Run it in CI instead.
- Add `--min-score 80` to also gate on the score.
- To scan only against the default branch, so the hook behaves the same on every branch, pass it explicitly:
  `--diff main`.

Exit codes are documented in [CLI usage](./cli-usage#exit-codes). To adopt the gate on a project with existing
findings, record a [baseline](./baseline) first and add `--gate new`.

## lint-staged

lint-staged appends the staged file names to the command. `vue-doctor` takes a directory, not files, so register it as
a function that ignores them:

```js
// lint-staged.config.js
export default {
  "*.{vue,js,ts}": () => "vue-doctor . --diff --fail-on error --no-dead-code --quiet",
};
```

The function form runs the command once. This has the scope of `--diff` above, not only the staged files.

Use `vue-doctor --diff` as the commit gate. It is the only option that honours `vue-doctor-disable` comments, your
vue-doctor config (severities, ignores) and [baselines](./baseline).

For a faster check of exactly the staged files you can run the Oxlint plugin directly; lint-staged passes the file
names to it. Treat this as advisory, not as the gate:

```js
// lint-staged.config.js
export default {
  "*.{vue,js,ts}": "oxlint -c .oxlintrc.json",
};
```

The `.oxlintrc.json` is the one from [Editor integration](./editor). Oxlint ignores `vue-doctor-disable` comments, your
vue-doctor config and baselines, so it can fail a commit on findings the project has suppressed or baselined. Only
`oxlint-disable` comments apply to it. It exits `1` on an error-level finding and `0` for warnings only; add
`--deny-warnings` to fail on warnings as well. Only script rules run this way, so keep the full `vue-doctor` scan as
the gate and in CI.
