---
"@remylagerweij/vue-doctor": patch
---

`--fix` now only rewrites what the scan reports. It first runs the lint and template passes (honouring the project config, `vue-doctor-disable` comments and `--diff`), then applies a codemod only at the reported locations, writes each file atomically, and scans the fixed code. Previously it rewrote matching patterns in every source file, including suppressed or disabled findings.

- Removed the blanket `.sort(` to `.toSorted(` rewrite, which silently stopped in-place sorts such as `items.sort()` from sorting. `vue-doctor/performance/js-tosorted-immutable` is not auto-fixed: the rule cannot tell whether `x` in `[...x].sort()` is an array, and `toSorted` throws on a Set or string (and needs an ES2023 `lib`). Switch to `toSorted` by hand where `x` is an array.
- Removed the `v-for` key codemod: it guessed `:key="item.id || item"`, which is not a correct key in general. Add keys by hand.
- The lodash codemod (`vue-doctor/bundle-size/no-full-lodash-import`) leaves default, namespace and inline `type` imports alone. The `rel="noopener noreferrer"` codemod (`vue/no-template-target-blank`) handles `>` inside attribute values and self-closing tags, ignores `<a-button>`-style components and skips links with a dynamic `:rel`.
- `vue-doctor/bundle-size/no-full-lodash-import` and `vue/no-template-target-blank` are now `fixable: true` in reports, `vue-doctor rules` and the MCP server (no rule was marked fixable before, and `--fix` attributed its rewrites to rule IDs that do not exist).
- `--fix --dry-run` prints a proper unified diff with hunks, and `--fix` cannot be combined with `--no-lint`.
