<script setup lang="ts">
// Correctness issues fixture

// no-prevent-default
const handleSubmit = (e: Event) => {
  e.preventDefault();
};

// no-direct-dom-manipulation
const element = document.getElementById("app");
const elements = document.querySelectorAll(".item");

// prefer-defineProps-destructure
const props = defineProps<{ title: string; count: number }>();
</script>

<template>
  <div>Correctness Issues</div>
</template>
