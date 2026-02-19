import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import * as vueParser from "vue-eslint-parser";

RuleTester.describe = describe;
RuleTester.it = it;
import {
  piniaNoDestructure,
  piniaNoWatchStore,
  routerNoStringPush,
  routerNoAsyncGuardWithoutNext,
} from "../../src/plugin/rules/ecosystem.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

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
  ],
  invalid: [
    {
      code: `
        <script setup>
        const { count, user } = useAuthStore()
        </script>
      `,
      errors: [{ message: "Directly destructuring a Pinia store breaks reactivity. Use `storeToRefs` instead (e.g., `const { count } = storeToRefs(useMyStore())`)." }],
    },
  ],
});

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
  ],
  invalid: [
    {
      code: `
        <script setup>
        const authStore = useAuthStore()
        watch(authStore, () => console.log('changed'))
        </script>
      `,
      errors: [{ message: "Watching an entire Pinia store object is extremely expensive. Use `<store>.$subscribe()` or watch specific primitive getters instead." }],
    },
    {
      code: `
        <script setup>
        const authStore = useAuthStore()
        watch(() => authStore, () => console.log('changed'))
        </script>
      `,
      errors: [{ message: "Watching an entire Pinia store object is extremely expensive. Use `<store>.$subscribe()` or watch specific primitive getters instead." }],
    },
  ],
});


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
  ],
  invalid: [
    {
       code: `
        <script setup>
        const router = useRouter()
        router.push('/dashboard')
        </script>
      `,
       errors: [{ message: "Pass a route object (e.g. `{ name: 'RouteName' }` or `{ path: '...' }`) instead of a raw string to router.push/replace. This is more robust against refactoring." }],
    },
    {
       code: `
        <script setup>
        const router = useRouter()
        router.replace(\`/user/\${id}\`)
        </script>
      `,
       errors: [{ message: "Pass a route object (e.g. `{ name: 'RouteName' }` or `{ path: '...' }`) instead of a raw string to router.push/replace. This is more robust against refactoring." }],
    },
    {
       code: `
        <script>
        export default {
          methods: {
            go() {
               this.$router.push('/home')
            }
          }
        }
        </script>
      `,
       errors: [{ message: "Pass a route object (e.g. `{ name: 'RouteName' }` or `{ path: '...' }`) instead of a raw string to router.push/replace. This is more robust against refactoring." }],
    }
  ],
});

ruleTester.run("router-no-async-guard-without-next", routerNoAsyncGuardWithoutNext, {
  valid: [
    {
      code: `
        <script setup>
        const router = useRouter()
        router.beforeEach(async (to, from, next) => {
           // Testing heuristic: next() params skips our basic block check since it passes 3 args
           const isAuth = await checkAuth()
           next()
        })

        router.beforeEach(async (to, from) => {
           const isAuth = await checkAuth()
           if (!isAuth) {
             return { name: 'Login' }
           }
           return true
        })
        </script>
      `,
    }
  ],
  invalid: [
    {
      code: `
        <script setup>
        const router = useRouter()
        router.beforeEach(async (to, from) => {
           const isAuth = await checkAuth()
           if (!isAuth) {
              console.log('failed')
           }
        })
        </script>
      `,
      errors: [{ message: "Async beforeEach/beforeResolve navigation guards must explicitly return a RouteLocationRaw or boolean to resolve the navigation hook." }],
    }
  ],
});
