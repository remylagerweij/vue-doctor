<script setup lang="ts">
import { ref, watch, watchEffect, reactive, computed, nextTick } from "vue";

const props = defineProps<{ modelValue: string }>();

// no-ref-from-prop
const localValue = ref(props.modelValue);

// no-watch-for-computed
const derivedValue = ref("");
watch(() => localValue.value, (newVal) => { derivedValue.value = newVal; });

// prefer-computed
const doubled = ref(0);
const count = ref(1);
watchEffect(() => { doubled.value = count.value * 2; });

// no-cascading-mutations
const a = ref(0);
const b = ref("");
watch(() => count.value, (next) => {
  a.value = next + 1;
  track(next);
});
watch(a, (next) => {
  b.value = String(next);
  track(next);
});

// no-fetch-in-watch
watch(() => count.value, async () => { await fetch("/api"); });

// no-reactive-destructure
const { x } = reactive({ x: 1 });

// no-mutation-in-computed
const val = ref(0);
const double = computed(() => { val.value++; return val.value * 2; });

// no-reactive-replace
let r = reactive({ a: 1 });
r = reactive({ a: 2 });

// no-missing-await-nextTick
nextTick();

</script>

<template>
  <div>Test</div>
</template>
