import type { RulePlugin } from "./types.js";

import {
  noFetchInWatch,
  noCascadingMutations,
  noWatchForComputed,
  noRefFromProp,
  preferComputed,
  noReactiveReplace,
  noMissingAwaitNextTick,
} from "./rules/reactivity.js";

import { noGiantComponent, noNestedComponentDefinition } from "./rules/architecture.js";

import {
  noLayoutPropertyAnimation,
  noTransitionAll,
  noGlobalCssVariableAnimation,
  noLargeAnimatedBlur,
  noScaleFromZero,
  noPermanentWillChange,
} from "./rules/performance.js";

import { noSecretsInClientCode } from "./rules/security.js";

import {
  noBarrelImport,
  noFullLodashImport,
  noMoment,
  preferDynamicImport,
  noUndeferredThirdParty,
} from "./rules/bundle-size.js";

import { noArrayIndexAsKey, noPreventDefault } from "./rules/correctness.js";

import {
  nuxtNoImgElement,
  nuxtNoAElement,
  nuxtNoHeadImport,
  nuxtNoClientFetchForServerData,
  nuxtAsyncClientComponent,
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

    // Architecture
    "no-giant-component": noGiantComponent,
    "no-nested-component-definition": noNestedComponentDefinition,

    // Performance (CSS Animations)
    "no-layout-property-animation": noLayoutPropertyAnimation,
    "no-transition-all": noTransitionAll,
    "no-global-css-variable-animation": noGlobalCssVariableAnimation,
    "no-large-animated-blur": noLargeAnimatedBlur,
    "no-scale-from-zero": noScaleFromZero,
    "no-permanent-will-change": noPermanentWillChange,

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

    // Nuxt
    "nuxt-no-img-element": nuxtNoImgElement,
    "nuxt-no-a-element": nuxtNoAElement,
    "nuxt-no-head-import": nuxtNoHeadImport,
    "nuxt-no-client-fetch-for-server-data": nuxtNoClientFetchForServerData,
    "nuxt-async-client-component": nuxtAsyncClientComponent,

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
