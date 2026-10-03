<script setup lang="ts">
// no-secret-named-literal
const stripeSecret = "k3J9xQ2mZp7LwR4vB8nT1cY6hD5s";

// no-eval
eval("console.log('evil')");

// no-v-html
// WARNING: Do not include an unescaped closing script tag here or it breaks the Vue SFC parser!
const badContent = '<script>alert(1)';

// no-unsafe-html-sink (script side)
document.body.innerHTML = decodeURIComponent(location.hash);
</script>

<template>
  <div>
    <!-- no-v-html -->
    <div v-html="badContent"></div>
  </div>
</template>
