<script setup lang="ts">
import { ref, watch, watchEffect } from "vue";

const props = defineProps<{ modelValue: string }>();

// no-ref-from-prop: bad — creates a copy
const localValue = ref(props.modelValue);

// no-watch-for-computed: bad — should be computed
const derivedValue = ref("");
watch(
  () => localValue.value,
  (newVal) => {
    derivedValue.value = newVal.toUpperCase();
  }
);

// prefer-computed: bad — watchEffect that only sets a ref
const doubled = ref(0);
const count = ref(1);
watchEffect(() => {
  doubled.value = count.value * 2;
});

// no-cascading-mutations: bad — too many mutations in watch
const a = ref(0);
const b = ref(0);
const c = ref(0);
const d = ref(0);
watch(() => count.value, () => {
  a.value = count.value + 1;
  b.value = count.value + 2;
  c.value = count.value + 3;
  d.value = count.value + 4;
});

// no-fetch-in-watch: bad — fetch in watch
watch(() => count.value, async () => {
  await fetch("/api/data");
});
</script>

<template>
  <div>{{ derivedValue }}</div>
</template>
