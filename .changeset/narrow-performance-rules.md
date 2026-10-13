---
"@remylagerweij/vue-doctor": patch
---

Narrow nine performance rules that reported mostly false positives on a real Nuxt 4 monorepo:

- `js-combine-iterations` reports only chains of three or more iteration methods, or two-step chains evaluated inside a loop or array callback. It skips small array literals (up to 8 elements) and a `.filter(Boolean)` or type-guard filter that only compacts a preceding `.map()`.
- `js-tosorted-immutable` skips spreads of Sets, Maps and iterators (`.values()`, `.keys()`, `.entries()`, `new Set(...)`, values declared or typed as a Set or Map, `ref(new Set())`), which have no `toSorted`. The help now says the rewrite is for readability and needs an ES2023 target.
- `async-parallel` treats destructured bindings and expression-statement awaits as dependencies. It treats auth, rate-limit and validation guards (`ensureAdmin`, `requireOrganizationContext`, `enforceRateLimit`, …) and unbound writes that precede other awaits as barriers, and calls on the same receiver with the same key as ordered. It also requires at least two awaits that are not request accessors (`readBody`, `serverSupabaseClient`, …).
- `js-set-map-lookups` skips declared array literals of up to 16 elements that are never grown.
- `js-index-maps` reports only key-equality predicates (`find(x => x.id === id)`) on an array that is not declared or reassigned inside the loop.
- `no-deep-watch` skips primitive sources (primitive props, refs of primitives) and getters that return a literal of plain reads, and suggests `deep: 1` (Vue 3.5+).
- `client-passive-event-listeners` checks only `touchstart`, `touchmove`, `wheel` and `mousewheel`, and skips handlers that call `preventDefault()`.
- `js-batch-dom-css` reports layout thrashing (a layout read between style writes, or a loop body that both reads layout and writes styles) instead of consecutive style writes.
- `js-hoist-regexp` reports only a `new RegExp()` whose arguments are all literals or loop-invariant identifiers.
