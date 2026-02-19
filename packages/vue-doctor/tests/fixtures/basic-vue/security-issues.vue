<script setup lang="ts">
// no-secrets-in-client-code
const stripeSecret = "this_is_a_very_long_string_that_is_definitely_not_a_real_api_key_but_triggers_our_rule";

// no-eval
eval("console.log('evil')");

// no-v-html
// WARNING: Do not include an unescaped closing script tag here or it breaks the Vue SFC parser!
const badContent = '<script>alert(1)';
</script>

<template>
  <div>
    <!-- no-v-html -->
    <div v-html="badContent"></div>
  </div>
</template>
