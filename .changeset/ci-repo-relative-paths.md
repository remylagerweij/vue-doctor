---
"@remylagerweij/vue-doctor": patch
---

`ci run` now anchors PR review comments and annotations at repository-relative paths. When the scanned directory was not the repository root (a monorepo app such as `apps/web`, or a workspace project), review comments used project-relative paths and GitHub rejected every one with `422 path could not be resolved`. `--feedback annotations` in `ci run` now goes through the same escaped formatter as `--format github`, so a finding message can no longer inject a workflow command.
