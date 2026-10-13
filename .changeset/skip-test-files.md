---
"@remylagerweij/vue-doctor": patch
---

Rules about shipped code no longer run on test files. Browser-run component and end-to-end tests touch `window` and the DOM by design and are not worth micro-optimising, so `nuxt-no-window-in-ssr`, `no-direct-dom-manipulation`, the other Nuxt rendering rules, every `performance` and `bundle-size` rule and a few component-structure rules skip `*.spec.*`, `*.test.*`, `*.cy.*`, files under `test/`, `tests/`, `__tests__/`, `__mocks__/`, `__fixtures__/`, `e2e/` and `cypress/`, and test-runner config files. Security rules still run on them. Each rule page says whether it checks test files.
