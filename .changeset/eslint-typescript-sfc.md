---
"@remylagerweij/vue-doctor": patch
---

The eslint-plugin-vue pass now parses `<script lang="ts">`, so the rules that read the script work on TypeScript SFCs.

- `vue/require-explicit-emits` no longer reports events declared with a typed `defineEmits<…>()`. Before, a TypeScript script was skipped, so every `$emit` in the template was flagged.
- `vue/no-mutating-props`, `vue/no-dupe-keys`, `vue/no-template-shadow`, `vue/no-ref-as-operand` and the computed-property rules (`no-side-effects-in-computed-properties`, `no-async-in-computed-properties`, `return-in-computed-property`, `no-computed-properties-in-data`) now check TypeScript SFCs. Expect new findings where these rules were silent before.
- TypeScript syntax in template expressions (`value as string`, `item!`) is parsed too.
- A script that still fails to parse is linted without it, and the rules that need the script are turned off for that file so they cannot report a component as if it had no script.
- New dependencies: `@typescript-eslint/parser` and `typescript` 6.0 (the last line with a JavaScript API). Vue Doctor uses its own copy, even when the project hoists TypeScript 7. `--debug` lists both versions.
