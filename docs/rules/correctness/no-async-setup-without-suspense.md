# `vue-doctor/correctness/no-async-setup-without-suspense`

> Wrap the async component in `<Suspense>` with a fallback, or move the awaited work into `onMounted()` or a composable

| Property | Value |
|---|---|
| **Category** | Correctness |
| **Default Severity** | `warning` |
| **Confidence** | medium |
| **Fixable** | No |
| **Engine** | `oxlint` |
| **Since** | v1.0.0 |
| **Frameworks** | vue, nuxt |
| **Test files** | Not checked ([which files](/guide/configuration#test-files)) |


## Why it matters

Wrap the async component in `<Suspense>` with a fallback, or move the awaited work into `onMounted()` or a composable

## How to fix

Review the finding and update the code according to best practices below.

## Agent Guidance

A top-level `await` in `<script setup>` (or an `async setup()`) makes the component async. Ensure a parent renders it inside `<Suspense>` with a fallback, or move the awaited work into `onMounted` or a composable. In Nuxt, `app.vue`, `error.vue`, pages and layouts are not reported: Nuxt renders them inside `<Suspense>`.

---

*Rule source: [`vue-doctor/correctness/no-async-setup-without-suspense`](https://github.com/remylagerweij/vue-doctor)*
