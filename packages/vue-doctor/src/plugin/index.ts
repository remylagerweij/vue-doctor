import type { RulePlugin } from "./types.js";

import {
  noFetchInWatch,
  noCascadingMutations,
  noWatchForComputed,
  noRefFromProp,
  preferComputed,
  noReactiveReplace,
  noMissingAwaitNextTick,
  noReactiveDestructure,
  noMutationInComputed,
} from "./rules/reactivity.js";

import { noGiantComponent, noNestedComponentDefinition } from "./rules/architecture.js";

import {
  noLayoutPropertyAnimation,
  noTransitionAll,
  noGlobalCssVariableAnimation,
  noLargeAnimatedBlur,
  noScaleFromZero,
  noPermanentWillChange,
  noDeepWatch,
} from "./rules/performance.js";

import { noSecretsInClientCode } from "./rules/security.js";

import {
  noBarrelImport,
  noFullLodashImport,
  noMoment,
  preferDynamicImport,
  noUndeferredThirdParty,
} from "./rules/bundle-size.js";

import {
  noArrayIndexAsKey,
  noPreventDefault,
  noThisInSetup,
  requireDefinePropsTypes,
} from "./rules/correctness.js";

import {
  nuxtNoImgElement,
  nuxtNoAElement,
  nuxtNoHeadImport,
  nuxtNoClientFetchForServerData,
  nuxtAsyncClientComponent,
  nuxtNoWindowInSsr,
  nuxtRequireSeoMeta,
  nuxtNoProcessEnvInClient,
  nuxtRequireServerRouteErrorHandling,
} from "./rules/nuxt.js";

import { clientPassiveEventListeners } from "./rules/client.js";

import {
  asyncParallel,
  jsCombineIterations,
  jsTosortedImmutable,
  jsHoistRegexp,
  jsMinMaxLoop,
  jsSetMapLookups,
  jsBatchDomCss,
  jsIndexMaps,
  jsCacheStorage,
  jsEarlyExit,
} from "./rules/js-performance.js";

import {
  noVHtml,
  preferDefinePropsDestructure,
  noDirectDomManipulation,
  noAsyncSetupWithoutSuspense,
  requireEmitsDeclaration,
} from "./rules/vue-specific.js";

import { serverNoConsoleInHandler } from "./rules/server.js";

const plugin: RulePlugin = {
  meta: {
    name: "vue-doctor",
  },
  rules: {
    // Reactivity & Composables
    "no-fetch-in-watch": noFetchInWatch,
    "no-cascading-mutations": noCascadingMutations,
    "no-watch-for-computed": noWatchForComputed,
    "no-ref-from-prop": noRefFromProp,
    "prefer-computed": preferComputed,
    "no-reactive-replace": noReactiveReplace,
    "no-missing-await-nextTick": noMissingAwaitNextTick,
    "no-reactive-destructure": noReactiveDestructure,
    "no-mutation-in-computed": noMutationInComputed,

    // Architecture
    "no-giant-component": noGiantComponent,
    "no-nested-component-definition": noNestedComponentDefinition,

    // Performance (CSS Animations + Watchers)
    "no-layout-property-animation": noLayoutPropertyAnimation,
    "no-transition-all": noTransitionAll,
    "no-global-css-variable-animation": noGlobalCssVariableAnimation,
    "no-large-animated-blur": noLargeAnimatedBlur,
    "no-scale-from-zero": noScaleFromZero,
    "no-permanent-will-change": noPermanentWillChange,
    "no-deep-watch": noDeepWatch,

    // Security
    "no-secrets-in-client-code": noSecretsInClientCode,
    "no-v-html": noVHtml,

    // Bundle Size
    "no-barrel-import": noBarrelImport,
    "no-full-lodash-import": noFullLodashImport,
    "no-moment": noMoment,
    "prefer-dynamic-import": preferDynamicImport,
    "no-undeferred-third-party": noUndeferredThirdParty,

    // Correctness
    "no-array-index-as-key": noArrayIndexAsKey,
    "no-prevent-default": noPreventDefault,
    "no-direct-dom-manipulation": noDirectDomManipulation,
    "prefer-defineProps-destructure": preferDefinePropsDestructure,
    "no-this-in-setup": noThisInSetup,
    "require-defineprops-types": requireDefinePropsTypes,

    // Vue-Specific
    "no-async-setup-without-suspense": noAsyncSetupWithoutSuspense,
    "require-emits-declaration": requireEmitsDeclaration,

    // Nuxt
    "nuxt-no-img-element": nuxtNoImgElement,
    "nuxt-no-a-element": nuxtNoAElement,
    "nuxt-no-head-import": nuxtNoHeadImport,
    "nuxt-no-client-fetch-for-server-data": nuxtNoClientFetchForServerData,
    "nuxt-async-client-component": nuxtAsyncClientComponent,
    "nuxt-no-window-in-ssr": nuxtNoWindowInSsr,
    "nuxt-require-seo-meta": nuxtRequireSeoMeta,
    "nuxt-no-process-env-in-client": nuxtNoProcessEnvInClient,
    "nuxt-require-server-route-error-handling": nuxtRequireServerRouteErrorHandling,

    // Client Performance
    "client-passive-event-listeners": clientPassiveEventListeners,

    // Server
    "server-no-console-in-handler": serverNoConsoleInHandler,

    // JS Performance
    "async-parallel": asyncParallel,
    "js-combine-iterations": jsCombineIterations,
    "js-tosorted-immutable": jsTosortedImmutable,
    "js-hoist-regexp": jsHoistRegexp,
    "js-min-max-loop": jsMinMaxLoop,
    "js-set-map-lookups": jsSetMapLookups,
    "js-batch-dom-css": jsBatchDomCss,
    "js-index-maps": jsIndexMaps,
    "js-cache-storage": jsCacheStorage,
    "js-early-exit": jsEarlyExit,
  },
};

export default plugin;
