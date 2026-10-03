<script setup>
const items = [{ id: 1, name: "one" }];
</script>

<template>
  <div>
    <!-- vue/no-template-target-blank: external link without rel -->
    <a href="https://example.com" target="_blank">External</a>

    <!-- vue/require-v-for-key -->
    <ul>
      <li v-for="item in items">{{ item.name }}</li>
    </ul>
  </div>
</template>
