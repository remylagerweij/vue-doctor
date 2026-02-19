<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  // options api setup block for no-nested-component-definition rule
  async setup() {
    // no-async-setup-without-suspense
    await Promise.resolve();

    // no-nested-component-definition
    const MyComponent = defineComponent({});

    return {};
  },
  methods: {
    test() {
       // require-emits-declaration expects a MemberExpression like this.$emit
       this.$emit('foo');
    }
  }
});
</script>

<template>
  <div>Test</div>
</template>
