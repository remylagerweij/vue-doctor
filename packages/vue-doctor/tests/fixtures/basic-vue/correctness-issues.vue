<script lang="ts">
import { defineComponent } from 'vue';
import { defineProps } from 'vue';

export default defineComponent({
  setup() {
    // no-this-in-setup
    this.foo = 'bar';

    // no-giant-component
    // ...
  }
});
</script>

<script setup lang="ts">
// no-giant-component (triggered by simply having script content)

// prefer-defineProps-destructure
const props = defineProps();

// require-defineprops-types
const p2 = defineProps(['a']);

// no-direct-dom-manipulation
document.querySelector(".a");

// nuxt-no-window-in-ssr
window.location.href;

// no-prevent-default
function submit(e: Event) {
  e.preventDefault();
}

const items = [1, 2, 3];
// no-array-index-as-key
items.map((item, index) => {
  return {};
});
</script>

<template>
  <div></div>
</template>
