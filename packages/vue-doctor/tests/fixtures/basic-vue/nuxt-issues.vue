<script lang="ts">
import { defineComponent, h, onMounted } from "vue";
// nuxt-no-head-import
import { useHead } from "@vueuse/head";

export default defineComponent({
  // nuxt-async-client-component
  async setup() {
    // nuxt-no-client-fetch-for-server-data
    onMounted(async () => {
      await fetch("/api/users");
    });

    // nuxt-no-img-element
    h("img", { src: "/image.png" });

    // nuxt-no-a-element
    h("a", { href: "/about" }, "About");

    // nuxt-no-process-env-in-client
    if (process.env.API_KEY) {}

    // nuxt-no-window-in-ssr
    if (window.innerWidth > 500) {}

    // nuxt-require-seo-meta
    useHead({
      meta: [{ name: "description", content: "bad" }]
    });

    return () => h("div");
  }
});
</script>
