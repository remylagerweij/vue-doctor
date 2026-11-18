---
"@remylagerweij/vue-doctor": minor
---

Add `--no-inline-disables` (API: `diagnose(dir, { inlineDisables: false })`, MCP `scan`: `ignore_inline_disables`) for audits: `vue-doctor-disable` comments are ignored, so every finding is reported and counts toward score and gates. The report gains an optional `inlineDisables` field with the number of findings the comments would have hidden. Config `ignore` entries and baselines still apply.
