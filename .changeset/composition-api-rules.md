---
"@remylagerweij/vue-doctor": minor
---

Add a Composition API rule pack as opt-in preview rules (off by default; enable each one in `rules`, they turn on by default in 3.0):

- `vue-doctor/correctness/no-instance-api-after-await`: lifecycle hooks, `provide`/`inject`, `useSlots`/`useAttrs`/`useTemplateRef`/`useId`/`useModel` and imported `vue-router`/`vue-i18n` composables called after an `await` in a composable, `async setup()`, event handler or hook callback, where the component instance is gone. Top-level `await` in `<script setup>` and Nuxt plugin/middleware/`defineNuxtComponent` contexts are not reported.
- `vue-doctor/correctness/no-instance-api-in-async-callback`: the same APIs called inside `setTimeout`/`setInterval`/`requestAnimationFrame`/`nextTick`, promise reactions, event listeners or non-immediate `watch` callbacks.
- `vue-doctor/reactivity/no-unowned-watcher`: `watch`/`watchEffect` created after an `await` or in such a callback in component code, with the stop handle discarded, so it is never stopped.
- `vue-doctor/reactivity/no-reactive-spread-return`: `return { ...state }` of a `reactive()` object (or `setup()` props) from `setup()`, a composable or a Pinia setup store.
- `vue-doctor/reactivity/no-setup-props-destructure`: props destructured in a component's `setup()` parameter list or body (not `defineProps` in `<script setup>`).
- `vue-doctor/reactivity/no-primitive-watch-source`: `watch(state.count)`, `watch(props.count)` or `watch(count.value)` where the source is certainly a primitive, which Vue rejects as an invalid watch source.

Rules that are off by default can now be enabled from the project config: a `rules` key that names the rule (`"vue-doctor/reactivity/no-unowned-watcher": "warn"`) runs it; group keys (`vue-doctor/reactivity/*`) do not enable previews. Opting in a rule also invalidates the analysis cache for the analyzer that runs it.
