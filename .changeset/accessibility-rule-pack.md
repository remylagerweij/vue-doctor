---
"@remylagerweij/vue-doctor": minor
---

Add an opt-in Accessibility rule pack (`vue-doctor/accessibility/*`, 11 rules) that checks Vue templates and JSX/TSX: `require-img-alt`, `require-iframe-title`, `require-button-name`, `require-link-name`, `require-form-control-label`, `click-events-have-key-events`, `no-positive-tabindex`, `no-invalid-aria-attribute`, `no-invalid-role`, `no-aria-hidden-on-focusable` and `role-has-required-aria-props`.

The rules ship off by default (preview, since 2.5.0). Turn them on in `vue-doctor.config.*` with `"rules": { "vue-doctor/accessibility/*": "warn" }` or per rule. Rules with default severity `off` can now be enabled through `rules` end to end (lint, template and project-check passes, and the analysis cache); the last matching key wins, `ignore.rules` still excludes them and presets never enable them.

The rules only check native HTML elements, treat `:attr` bindings as present, skip elements with `v-bind="obj"`, and skip a component's root element (it receives attributes through fallthrough) and test files.
