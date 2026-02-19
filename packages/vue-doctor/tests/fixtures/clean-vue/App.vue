<script setup lang="ts">
// No issues — clean component for score baseline

import { ref, computed } from "vue";

const count = ref(0);
const doubled = computed(() => count.value * 2);

const increment = () => {
  count.value++;
};
</script>

<template>
  <div>
    <p>{{ doubled }}</p>
    <button @click="increment">+</button>
  </div>
</template>
