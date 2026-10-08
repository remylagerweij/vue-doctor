---
"@remylagerweij/vue-doctor": patch
---

`ci run` keeps PR comments separate per scanned directory. When a workflow scans several monorepo projects in parallel (one matrix job each), every job used to overwrite the same sticky summary, so only the last project to finish was visible, and each job deleted the other jobs' review comments as stale. The sticky summary marker now carries the scanned directory (`<!-- vue-doctor:summary:apps/web -->`) and the summary title names it; review comments carry a `<!-- vue-doctor:scope:… -->` marker and a scan only updates or removes its own. A scan of the repository root keeps the existing markers, so single-project repositories see no change.
