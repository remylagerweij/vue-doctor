<script setup lang="ts">
// Performance issues fixture

// no-transition-all
const style1 = { transition: "all 200ms ease" };

// no-layout-property-animation
const style2 = { transition: "width 200ms ease" };

// no-permanent-will-change
const style3 = { willChange: "transform" };

// no-scale-from-zero
const style4 = { scale: 0 };

// no-large-animated-blur
const style5 = { filter: "blur(25px)" };

// async-parallel
const fetchData = async () => {
  const res1 = await fetch("/api/a");
  const res2 = await fetch("/api/b");
  const res3 = await fetch("/api/c");
};

// client-passive-event-listeners
document.addEventListener("scroll", () => {});
</script>

<template>
  <div :style="style1">Performance Issues</div>
</template>
