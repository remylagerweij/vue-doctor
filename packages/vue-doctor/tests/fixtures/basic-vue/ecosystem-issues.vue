<template>
  <div>
    <button @click="navigateBad">Go</button>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'

// 1. pinia-no-destructure
const { count, user } = useAuthStore() // BAD: Reactivity lost
const { name } = storeToRefs(useUserStore()) // GOOD


// 2. pinia-no-watch-store
const authStore = useAuthStore()
watch(authStore, () => { // BAD: Deep watching whole store
  console.log('changed')
}, { deep: true })
authStore.$subscribe(() => { // GOOD
  console.log('changed')
})


// 3. router-no-string-push
const router = useRouter()

const navigateBad = () => {
  router.push('/dashboard') // BAD: raw string used
  router.replace(`/user/${user.value.id}`) // BAD: template literal used
}

const navigateGood = () => {
  router.push({ name: 'Dashboard' }) // GOOD
  router.replace({ path: `/user/${user.value.id}` }) // GOOD
}

// 4. router-no-async-guard-without-next
router.beforeEach(async (to, from) => {
  const isAuth = await checkAuth()
  if (!isAuth) {
    console.log('redirecting')
    // BAD: missing return statement for standard flow
  }
})

router.beforeEach(async (to, from) => {
  const isAuth = await checkAuth()
  if (!isAuth) {
    return { name: 'Login' } // GOOD
  }
  return true // GOOD
})
</script>
