---
"@remylagerweij/vue-doctor": patch
---

Fewer false positives in ten rules, found by running Vue Doctor on a large Nuxt 4 monorepo.

- `correctness/prefer-defineProps-destructure` only runs when the project's installed Vue is 3.5+ (or `propsDestructure: true` is set) and `propsDestructure` is not disabled in `nuxt.config`/`vite.config`. It skips props objects used as a value (`toRefs(props)`, `toRef(props, "x")`, `watch(props)`, spreads, `Object.keys(props)`, composable arguments, `v-bind="props"`) and now also reports `withDefaults(defineProps())`.
- `nuxt/nuxt-no-process-env-in-client` only checks files that end up in the client bundle (srcDir `components`, `pages`, `layouts`, `composables`, non-`.server` `plugins`, `middleware`, `stores`, `utils`, `app.vue`, `error.vue`); `scripts/`, `bin/`, `server/`, `shared/` and config files are Node code.
- `reactivity/no-watch-for-computed` only reports a watcher whose assignment reads the watch source and whose target ref nothing else writes (script assignments, `v-model`, template handlers, composable arguments, returned refs).
- `reactivity/no-cascading-mutations` detects real cascades (a watcher writes state that another watcher watches and derives from) instead of counting assignments in one watcher.
- `reactivity/no-mutation-in-computed` recognises more values created inside the getter: ternaries and fallbacks of fresh values, `split`/`match`, `Object.keys/values/entries`, `Array.from/of`, `new Map/Set/Array`, `structuredClone`, and `.get()` of a getter-local container; TypeScript casts are looked through.
- `reactivity/no-ref-from-prop` skips `initial*`/`default*` props and copies that are written later (editable drafts, refs re-synced by a watch), and now also covers destructured props.
- `correctness/no-prevent-default` only checks `.vue` files, treats a call after a guard `return` as conditional, and skips named handlers registered with `addEventListener`/`useEventListener`.
- `security/no-secret-named-literal` ignores values that are environment variable names, and no longer says "client code" for scripts and test support files.
- `security/no-javascript-url` words a static `javascript:void(0)` / `javascript:;` placeholder as an accessibility/CSP problem; dynamic `javascript:` URLs keep the XSS wording.
- `supply-chain/no-dependency-install-scripts` skips install scripts that only `echo`/`true`/`exit 0`, and dependencies reviewed in npm `allowScripts` / `.npmrc allow-scripts`, pnpm `onlyBuiltDependencies` (and the never/ignored lists), Bun `trustedDependencies` or Yarn `dependenciesMeta.*.built: false`.
