---
"@remylagerweij/vue-doctor": minor
---

`vue-doctor agents install` can now install hooks, both opt-in. `--hooks` adds an end-of-turn hook for Claude Code (`Stop` in `.claude/settings.json`) and Cursor (`stop` in `.cursor/hooks.json`) that scans the files the agent changed and hands new findings back to it. It reports a given set of findings once per session and never loops, is fast (changed files only, no dead-code analysis, no network), and fails open. `--pre-commit` adds an advisory git pre-commit hook that prints findings and never fails the commit; it is only written when no pre-commit hook exists, and husky, lefthook and simple-git-hooks projects get a snippet to add instead. Settings are merged without touching other keys, re-runs change nothing, and `--remove` with the same flags takes the hooks out again. New options: `--hooks`, `--pre-commit`, `--runner <command>`, `-y, --yes`.
