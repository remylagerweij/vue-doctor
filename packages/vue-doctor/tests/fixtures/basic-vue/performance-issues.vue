<script setup lang="ts">
// no-giant-component (triggered by simply having script content)

// no-global-css-variable-animation
const style = document.body.style;
style.setProperty("--theme-color", "red");

// no-transition-all, no-scale-from-zero, no-large-animated-blur, no-permanent-will-change
// putting them in script so oxlint parses them as JS Properties
const badStyles = {
  transition: "all 0.3s ease",
  transform: "scale(0)",
  filter: "blur(20px)",
  willChange: "transform"
};

// no-layout-property-animation
const layoutStyle = {
  transition: "margin-left 0.3s"
}

// client-passive-event-listeners
window.addEventListener("scroll", () => {
  // nuxt-no-window-in-ssr (using window)
});

import { watch } from "vue";
const obj = { nested: true };
// no-deep-watch
watch(obj, () => {}, { deep: true });

async function load() {
  // async-parallel
  const a = await fetch('/api/a');
  const b = await fetch('/api/b');
}
</script>
