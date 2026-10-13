---
"@remylagerweij/vue-doctor": patch
---

`no-async-setup-without-suspense` no longer reports `app.vue`, `error.vue`, pages and layouts in Nuxt projects: Nuxt renders them inside `<Suspense>` through `<NuxtPage>` and `<NuxtLayout>`. Both the Nuxt 4 `app/` layout and the Nuxt 3 root layout are recognised; plain components are still reported.
