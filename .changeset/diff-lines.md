---
"@remylagerweij/vue-doctor": minor
---

Add `--diff-lines` (config: `diffLines`) to report only the findings a change introduces. It implies `--diff` and keeps findings whose line was added or modified versus the same merge base (a zero-context `git diff` of the working tree); new and untracked files count as fully changed, renames follow the new path, and file-level findings (dead code, filesystem rules, dependency audit) are kept for changed files. Findings off the changed lines are dropped before the baseline, score and gate, so the text report, JSON report and exit code agree; the JSON report marks the scope with `changedLinesOnly` and counts what was left out in `outsideChangedLines`.
