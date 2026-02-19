import type { Framework } from "./types.js";

const NUXT_RULES: Record<string, string> = {
  "vue-doctor/nuxt-no-img-element": "warn",
  "vue-doctor/nuxt-no-a-element": "warn",
  "vue-doctor/nuxt-no-head-import": "warn",
  "vue-doctor/nuxt-no-client-fetch-for-server-data": "warn",
  "vue-doctor/nuxt-async-client-component": "error",
  "vue-doctor/nuxt-no-window-in-ssr": "error",
  "vue-doctor/nuxt-require-seo-meta": "warn",
  "vue-doctor/nuxt-no-process-env-in-client": "error",
  "vue-doctor/nuxt-require-server-route-error-handling": "error",
};

const SERVER_RULES: Record<string, string> = {
  "vue-doctor/server-no-console-in-handler": "warn",
};

interface OxlintConfigOptions {
  pluginPath: string;
  framework: Framework;
}

export const createOxlintConfig = ({
  pluginPath,
  framework,
}: OxlintConfigOptions) => ({
  categories: {
    correctness: "off",
    suspicious: "off",
    pedantic: "off",
    perf: "off",
    restriction: "off",
    style: "off",
    nursery: "off",
  },
  plugins: [],
  jsPlugins: [pluginPath],
  rules: {
    // Reactivity
    "vue-doctor/no-fetch-in-watch": "error",
    "vue-doctor/no-cascading-mutations": "warn",
    "vue-doctor/no-watch-for-computed": "error",
    "vue-doctor/no-ref-from-prop": "warn",
    "vue-doctor/prefer-computed": "warn",
    "vue-doctor/no-reactive-replace": "error",
    "vue-doctor/no-missing-await-nextTick": "warn",
    "vue-doctor/no-reactive-destructure": "warn",
    "vue-doctor/no-mutation-in-computed": "error",

    // Architecture
    "vue-doctor/no-giant-component": "warn",
    "vue-doctor/no-nested-component-definition": "error",

    // Performance (CSS)
    "vue-doctor/no-layout-property-animation": "error",
    "vue-doctor/no-transition-all": "warn",
    "vue-doctor/no-global-css-variable-animation": "error",
    "vue-doctor/no-large-animated-blur": "warn",
    "vue-doctor/no-scale-from-zero": "warn",
    "vue-doctor/no-permanent-will-change": "warn",
    "vue-doctor/no-deep-watch": "warn",

    // Security
    "vue-doctor/no-secrets-in-client-code": "error",
    "vue-doctor/no-v-html": "warn",

    // Bundle Size
    "vue-doctor/no-barrel-import": "warn",
    "vue-doctor/no-full-lodash-import": "warn",
    "vue-doctor/no-moment": "warn",
    "vue-doctor/prefer-dynamic-import": "warn",
    "vue-doctor/no-undeferred-third-party": "warn",

    // Correctness
    "vue-doctor/no-array-index-as-key": "warn",
    "vue-doctor/no-prevent-default": "warn",
    "vue-doctor/no-direct-dom-manipulation": "warn",
    "vue-doctor/prefer-defineProps-destructure": "warn",
    "vue-doctor/no-this-in-setup": "error",
    "vue-doctor/require-defineprops-types": "warn",

    // Vue-Specific
    "vue-doctor/no-async-setup-without-suspense": "error",
    "vue-doctor/require-emits-declaration": "warn",

    // Client
    "vue-doctor/client-passive-event-listeners": "warn",

    // JS Performance
    "vue-doctor/async-parallel": "warn",
    "vue-doctor/js-combine-iterations": "warn",
    "vue-doctor/js-tosorted-immutable": "warn",
    "vue-doctor/js-hoist-regexp": "warn",
    "vue-doctor/js-min-max-loop": "warn",
    "vue-doctor/js-set-map-lookups": "warn",
    "vue-doctor/js-batch-dom-css": "warn",
    "vue-doctor/js-index-maps": "warn",
    "vue-doctor/js-cache-storage": "warn",
    "vue-doctor/js-early-exit": "warn",

    // Server
    ...(framework === "nuxt" ? { ...NUXT_RULES, ...SERVER_RULES } : {}),
  },
});
