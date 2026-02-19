<script setup lang="ts">
// JS Performance issues fixture

// js-combine-iterations
const items = [1, 2, 3, 4, 5];
const result = items.filter((x) => x > 2).map((x) => x * 2);

// js-tosorted-immutable
const sorted = [...items].sort((a, b) => a - b);

// js-early-exit
const deepNest = (x: number) => {
  if (x > 0) {
    if (x > 1) {
      if (x > 2) {
        if (x > 3) {
          return x;
        }
      }
    }
  }
  return 0;
};

// js-cache-storage
const val1 = localStorage.getItem("token");
const val2 = localStorage.getItem("token");

// js-batch-dom-css
const el = document.createElement("div");
el.style.width = "100px";
el.style.height = "200px";
</script>

<template>
  <div>JS Performance Issues</div>
</template>
