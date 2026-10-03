import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import * as vueParser from "vue-eslint-parser";

RuleTester.describe = describe;
RuleTester.it = it;
import piniaNoDestructure from "../../src/plugin/rules/ecosystem/pinia-no-destructure.js";
import piniaNoWatchStore from "../../src/plugin/rules/ecosystem/pinia-no-watch-store.js";
import routerNoStringPush from "../../src/plugin/rules/ecosystem/router-no-string-push.js";
import routerNoAsyncGuardWithoutNext from "../../src/plugin/rules/ecosystem/router-no-async-guard-without-next.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

const DESTRUCTURE_MESSAGE =
  "Directly destructuring a Pinia store breaks reactivity. Use `storeToRefs` instead (e.g., `const { count } = storeToRefs(useMyStore())`).";

ruleTester.run("pinia-no-destructure", piniaNoDestructure, {
  valid: [
    {
      code: `
        <script setup>
        const { name } = storeToRefs(useUserStore())
        const store = useAuthStore()
        </script>
      `,
    },
    {
      // Actions are bound to the store, so destructuring them is safe.
      code: `
        <script setup>
        const { increment, fetchUser, $reset } = useCounterStore()
        </script>
      `,
    },
    { code: `<script setup>const {} = useCounterStore()</script>` },
  ],
  invalid: [
    {
      code: `
        <script setup>
        const { count, user } = useAuthStore()
        </script>
      `,
      errors: [{ message: DESTRUCTURE_MESSAGE }],
    },
    {
      // State mixed with actions still loses reactivity.
      code: `
        <script setup>
        const { count, increment } = useCounterStore()
        </script>
      `,
      errors: [{ message: DESTRUCTURE_MESSAGE }],
    },
  ],
});

const WATCH_MESSAGE =
  "Watching an entire Pinia store object is extremely expensive. Use `<store>.$subscribe()` or watch specific primitive getters instead.";

ruleTester.run("pinia-no-watch-store", piniaNoWatchStore, {
  valid: [
    {
      code: `
        <script setup>
        const authStore = useAuthStore()
        authStore.$subscribe(() => console.log('changed'))
        watch(() => authStore.user, () => {})
        </script>
      `,
    },
    {
      // Names that merely end in "store" are not Pinia stores.
      code: `
        <script setup>
        watch(restore, () => {})
        watch(() => bookstore, () => {})
        </script>
      `,
    },
  ],
  invalid: [
    {
      code: `
        <script setup>
        const authStore = useAuthStore()
        watch(authStore, () => console.log('changed'))
        </script>
      `,
      errors: [{ message: WATCH_MESSAGE }],
    },
    {
      code: `
        <script setup>
        const authStore = useAuthStore()
        watch(() => authStore, () => console.log('changed'))
        </script>
      `,
      errors: [{ message: WATCH_MESSAGE }],
    },
  ],
});

const PUSH_MESSAGE =
  "Do not build a route path by string interpolation: params are not encoded and the route cannot be refactored. Pass a route object instead (e.g. `{ name: 'user', params: { id } }`).";

ruleTester.run("router-no-string-push", routerNoStringPush, {
  valid: [
    {
      code: `
        <script setup>
        const router = useRouter()
        router.push({ name: 'Dashboard' })
        router.replace({ path: '/user/123' })
        </script>
      `,
    },
    {
      code: `
        <script>
        export default {
          methods: {
            go() {
               this.$router.push({ name: 'Home' })
            }
          }
        }
        </script>
      `,
    },
    {
      // Static paths and expression-free templates are idiomatic.
      code: `
        <script setup>
        const router = useRouter()
        router.push('/dashboard')
        router.replace(\`/login\`)
        </script>
      `,
    },
    {
      // Not a router.
      code: `
        <script setup>
        queue.push(\`/user/\${id}\`)
        </script>
      `,
    },
  ],
  invalid: [
    {
      code: `
        <script setup>
        const router = useRouter()
        router.push('/user/' + id)
        </script>
      `,
      errors: [{ message: PUSH_MESSAGE }],
    },
    {
      code: `
        <script setup>
        const router = useRouter()
        router.replace(\`/user/\${id}\`)
        </script>
      `,
      errors: [{ message: PUSH_MESSAGE }],
    },
    {
      code: `
        <script>
        export default {
          methods: {
            go() {
              this.$router.push(\`/user/\${this.id}/edit\`)
            }
          }
        }
        </script>
      `,
      errors: [{ message: PUSH_MESSAGE }],
    },
  ],
});

ruleTester.run("router-no-async-guard-without-next", routerNoAsyncGuardWithoutNext, {
  valid: [
    {
      code: `
        <script setup>
        const router = useRouter()
        router.beforeEach(async (to, from, next) => {
          const isAuth = await checkAuth()
          if (!isAuth) return next({ name: 'Login' })
          next()
        })

        // Vue Router 4: falling through resolves to undefined, which allows the navigation.
        router.beforeEach(async (to, from) => {
          await trackNavigation(to)
        })

        router.beforeResolve(async (to, from) => {
          if (!(await checkAuth())) return { name: 'Login' }
        })

        // Handing next to a helper counts as using it.
        router.beforeEach(async (to, from, next) => {
          await guard(to, next)
        })

        // Synchronous guards and other objects are not checked.
        router.beforeEach((to, from, next) => {})
        other.beforeEach(async (to, from, next) => {})
        </script>
      `,
    },
  ],
  invalid: [
    {
      code: `
        <script setup>
        const router = useRouter()
        router.beforeEach(async (to, from, next) => {
          await checkAuth()
        })
        </script>
      `,
      errors: [{ message: "This async beforeEach guard declares `next` but never calls it, so navigation never resolves. Call `next()` or drop the parameter and return a value." }],
    },
    {
      code: `
        <script setup>
        const router = useRouter()
        router.beforeResolve(async function (to, from, next) {
          if (await checkAuth()) return true
        })
        </script>
      `,
      errors: [{ message: "This async beforeResolve guard declares `next` but never calls it, so navigation never resolves. Call `next()` or drop the parameter and return a value." }],
    },
  ],
});
