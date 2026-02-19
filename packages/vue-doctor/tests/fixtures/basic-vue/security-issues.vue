<script setup lang="ts">
// Security issues fixture

// no-secrets-in-client-code — uses variable name pattern detection
const API_KEY = "this-is-a-very-long-secret-key-value-for-testing";
const SECRET_TOKEN = "another-very-long-secret-token-value-here-12345";

// no-eval
const result = eval("1 + 1");
</script>

<template>
  <div>Security Issues</div>
</template>
