import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ERROR_PREVIEW_LENGTH_CHARS,
  VUE_FILE_PATTERN,
  SPAWN_ARGS_MAX_LENGTH_CHARS,
} from "../constants.js";
import { createOxlintConfig } from "../oxlint-config.js";
import type { CleanedDiagnostic, Diagnostic, Framework, OxlintOutput } from "../types.js";
import { neutralizeDisableDirectives } from "./neutralize-disable-directives.js";

const esmRequire = createRequire(import.meta.url);

const PLUGIN_CATEGORY_MAP: Record<string, string> = {};

const RULE_CATEGORY_MAP: Record<string, string> = {
  "vue-doctor/no-fetch-in-watch": "Reactivity",
  "vue-doctor/no-cascading-mutations": "Reactivity",
  "vue-doctor/no-watch-for-computed": "Reactivity",
  "vue-doctor/no-ref-from-prop": "Reactivity",
  "vue-doctor/prefer-computed": "Reactivity",
  "vue-doctor/no-reactive-replace": "Reactivity",
  "vue-doctor/no-missing-await-nextTick": "Reactivity",

  "vue-doctor/no-giant-component": "Architecture",
  "vue-doctor/no-nested-component-definition": "Architecture",

  "vue-doctor/no-layout-property-animation": "Performance",
  "vue-doctor/no-transition-all": "Performance",
  "vue-doctor/no-global-css-variable-animation": "Performance",
  "vue-doctor/no-large-animated-blur": "Performance",
  "vue-doctor/no-scale-from-zero": "Performance",
  "vue-doctor/no-permanent-will-change": "Performance",

  "vue-doctor/no-secrets-in-client-code": "Security",
  "vue-doctor/no-v-html": "Security",

  "vue-doctor/no-barrel-import": "Bundle Size",
  "vue-doctor/no-full-lodash-import": "Bundle Size",
  "vue-doctor/no-moment": "Bundle Size",
  "vue-doctor/prefer-dynamic-import": "Bundle Size",
  "vue-doctor/no-undeferred-third-party": "Bundle Size",

  "vue-doctor/no-array-index-as-key": "Correctness",
  "vue-doctor/no-prevent-default": "Correctness",
  "vue-doctor/no-direct-dom-manipulation": "Correctness",
  "vue-doctor/prefer-defineProps-destructure": "Correctness",

  "vue-doctor/nuxt-no-img-element": "Nuxt",
  "vue-doctor/nuxt-no-a-element": "Nuxt",
  "vue-doctor/nuxt-no-head-import": "Nuxt",
  "vue-doctor/nuxt-no-client-fetch-for-server-data": "Nuxt",
  "vue-doctor/nuxt-async-client-component": "Nuxt",

  "vue-doctor/client-passive-event-listeners": "Performance",

  "vue-doctor/pinia-no-destructure": "Ecosystem",
  "vue-doctor/pinia-no-watch-store": "Ecosystem",
  "vue-doctor/router-no-string-push": "Ecosystem",
  "vue-doctor/router-no-async-guard-without-next": "Ecosystem",

  "vue-doctor/server-no-console-in-handler": "Server",

  "vue-doctor/async-parallel": "Performance",
  "vue-doctor/js-combine-iterations": "Performance",
  "vue-doctor/js-tosorted-immutable": "Performance",
  "vue-doctor/js-hoist-regexp": "Performance",
  "vue-doctor/js-min-max-loop": "Performance",
  "vue-doctor/js-set-map-lookups": "Performance",
  "vue-doctor/js-batch-dom-css": "Performance",
  "vue-doctor/js-index-maps": "Performance",
  "vue-doctor/js-cache-storage": "Performance",
  "vue-doctor/js-early-exit": "Performance",
};

const RULE_HELP_MAP: Record<string, string> = {
  "no-fetch-in-watch":
    "Use `useFetch()` (Nuxt) or `useQuery()` from @tanstack/vue-query instead of watch + fetch",
  "no-cascading-mutations":
    "Combine related state into a single reactive object or use a composable to manage state transitions",
  "no-watch-for-computed":
    "Replace the watcher with a computed property: `const value = computed(() => transform(source))`",
  "no-ref-from-prop":
    "Remove the ref and derive inline: `const value = computed(() => transform(props.propName))`",
  "prefer-computed":
    "Use `const value = computed(() => expression)` instead of a watcher that only sets a ref",
  "no-reactive-replace":
    "Use `Object.assign(state, newState)` instead of replacing the reactive object reference",
  "no-missing-await-nextTick":
    "Add `await` before `nextTick()` or use `nextTick().then()` to ensure DOM updates are applied",

  "no-giant-component":
    "Extract logical sections into focused components or composables",
  "no-nested-component-definition":
    "Move to a separate .vue file or to a composable",

  "no-layout-property-animation":
    "Use `transform: translateX()` or `scale()` instead — they run on the compositor and skip layout/paint",
  "no-transition-all":
    'List specific properties: `transition: "opacity 200ms, transform 200ms"` — or in Tailwind use `transition-colors`, `transition-opacity`, or `transition-transform`',
  "no-global-css-variable-animation":
    "Set the variable on the nearest element instead of a parent, or use `@property` with `inherits: false`",
  "no-large-animated-blur":
    "Keep blur radius under 10px, or apply blur to a smaller element",
  "no-scale-from-zero":
    "Use `initial={{ scale: 0.95, opacity: 0 }}` — elements should deflate like a balloon, not vanish into a point",
  "no-permanent-will-change":
    "Add will-change on animation start and remove on end. Permanent promotion wastes GPU memory",

  "no-secrets-in-client-code":
    "Move to server-side `process.env.SECRET`. Only `VITE_*` / `NUXT_PUBLIC_*` vars are safe for the client",
  "no-v-html":
    "Sanitize content with DOMPurify or use text interpolation `{{ }}` instead of `v-html`",

  "no-barrel-import":
    "Import from the direct path: `import { Button } from './components/Button'` instead of `./components`",
  "no-full-lodash-import":
    "Import the specific function: `import debounce from 'lodash/debounce'` — saves ~70kb",
  "no-moment":
    "Replace with `import { format } from 'date-fns'` (tree-shakeable) or `import dayjs from 'dayjs'` (2kb)",
  "prefer-dynamic-import":
    "Use `defineAsyncComponent(() => import('./HeavyComponent.vue'))` for heavy components",
  "no-undeferred-third-party":
    "Use `useHead` with `defer: true` or add the `defer` attribute to third-party scripts",

  "no-array-index-as-key":
    "Use a stable unique identifier: `:key=\"item.id\"` — index keys break on reorder/filter",
  "no-prevent-default":
    "Use Vue's `.prevent` modifier: `@submit.prevent` instead of calling `event.preventDefault()`",
  "no-direct-dom-manipulation":
    "Use template refs: `const el = ref<HTMLElement>()` with `ref=\"el\"` instead of `document.querySelector()`",
  "prefer-defineProps-destructure":
    "Destructure props for reactive access: `const { prop1, prop2 } = defineProps<Props>()`",

  "nuxt-no-img-element":
    "Use `<NuxtImg>` from `@nuxt/image` — provides automatic optimization, lazy loading, and responsive images",
  "nuxt-no-a-element":
    "Use `<NuxtLink>` — enables client-side navigation and prefetching",
  "nuxt-no-head-import":
    "Use `useHead()` composable or `definePageMeta()` instead of importing head utilities",
  "nuxt-no-client-fetch-for-server-data":
    "Use `useFetch()` or `useAsyncData()` in Nuxt — data is fetched on the server and avoids client round-trip",
  "nuxt-async-client-component":
    "Avoid async setup in client components. Use `useFetch()` or `useAsyncData()` instead",

  "client-passive-event-listeners":
    "Add `{ passive: true }` as the third argument: `addEventListener('scroll', handler, { passive: true })`",

  "pinia-no-destructure":
    "Directly destructuring a Pinia store breaks reactivity. Use `storeToRefs` instead.",
  "pinia-no-watch-store":
    "Use `<store>.$subscribe()` or watch specific primitive getters instead of deep watching the entire store.",
  "router-no-string-push":
    "Pass a route object (e.g. `{ name: 'RouteName' }`) instead of a raw string to router.push/replace.",
  "router-no-async-guard-without-next":
    "Ensure your async beforeEach/beforeResolve navigation guard returns a value or calls next().",

  "server-no-console-in-handler":
    "Use a structured logger like `consola` or `pino` for server-side logging instead of `console.log()`",

  "async-parallel":
    "Use `const [a, b] = await Promise.all([fetchA(), fetchB()])` to run independent operations concurrently",
  "js-combine-iterations":
    "Combine chained `.map().filter()` into a single `.reduce()` or `for...of` loop",
  "js-tosorted-immutable":
    "Use `array.toSorted()` (ES2023) instead of `[...array].sort()` for cleaner immutable sorting",
  "js-hoist-regexp":
    "Hoist `new RegExp()` to a module-level constant to avoid re-compilation on every iteration",
  "js-min-max-loop":
    "Use `Math.min(...array)` or `Math.max(...array)` — O(n) instead of O(n log n) with sort",
  "js-set-map-lookups":
    "Convert the array to a `Set` before the loop for O(1) lookups instead of O(n)",
  "js-batch-dom-css":
    "Batch style changes with `el.style.cssText` or `el.classList.add()` to avoid multiple reflows",
  "js-index-maps":
    "Build a `Map` indexed by the search key before the loop for O(1) lookups",
  "js-cache-storage":
    "Cache `localStorage.getItem()` result in a variable to avoid redundant reads",
  "js-early-exit":
    "Use early returns to flatten deeply nested conditions for better readability",
};

const FILEPATH_WITH_LOCATION_PATTERN = /\S+\.\w+:\d+:\d+[\s\S]*$/;

const cleanDiagnosticMessage = (
  message: string,
  help: string,
  _plugin: string,
  rule: string,
): CleanedDiagnostic => {
  const cleaned = message.replace(FILEPATH_WITH_LOCATION_PATTERN, "").trim();
  return { message: cleaned || message, help: help || RULE_HELP_MAP[rule] || "" };
};

const parseRuleCode = (code: string): { plugin: string; rule: string } => {
  const match = code.match(/^(.+)\((.+)\)$/);
  if (!match) return { plugin: "unknown", rule: code };
  return { plugin: match[1].replace(/^eslint-plugin-/, ""), rule: match[2] };
};

const resolveOxlintBinary = (): string => {
  const oxlintMainPath = esmRequire.resolve("oxlint");
  const oxlintPackageDirectory = path.resolve(path.dirname(oxlintMainPath), "..");
  return path.join(oxlintPackageDirectory, "bin", "oxlint");
};

const resolvePluginPath = (): string => {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const pluginPath = path.join(currentDirectory, "vue-doctor-plugin.js");
  if (fs.existsSync(pluginPath)) return pluginPath;

  const distPluginPath = path.resolve(currentDirectory, "../../dist/vue-doctor-plugin.js");
  if (fs.existsSync(distPluginPath)) return distPluginPath;

  return pluginPath;
};

const resolveDiagnosticCategory = (plugin: string, rule: string): string => {
  const ruleKey = `${plugin}/${rule}`;
  return RULE_CATEGORY_MAP[ruleKey] ?? PLUGIN_CATEGORY_MAP[plugin] ?? "Other";
};

const estimateArgsLength = (args: string[]): number =>
  args.reduce((total, argument) => total + argument.length + 1, 0);

const batchIncludePaths = (baseArgs: string[], includePaths: string[]): string[][] => {
  const baseArgsLength = estimateArgsLength(baseArgs);
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentBatchLength = baseArgsLength;

  for (const filePath of includePaths) {
    const entryLength = filePath.length + 1;
    if (currentBatch.length > 0 && currentBatchLength + entryLength > SPAWN_ARGS_MAX_LENGTH_CHARS) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchLength = baseArgsLength;
    }
    currentBatch.push(filePath);
    currentBatchLength += entryLength;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

const spawnOxlint = (
  args: string[],
  rootDirectory: string,
  nodeBinaryPath: string,
): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(nodeBinaryPath, args, {
      cwd: rootDirectory,
    });

    const stdoutBuffers: Buffer[] = [];
    const stderrBuffers: Buffer[] = [];

    child.stdout.on("data", (buffer: Buffer) => stdoutBuffers.push(buffer));
    child.stderr.on("data", (buffer: Buffer) => stderrBuffers.push(buffer));

    child.on("error", (error) => reject(new Error(`Failed to run oxlint: ${error.message}`)));
    child.on("close", () => {
      const output = Buffer.concat(stdoutBuffers).toString("utf-8").trim();
      if (!output) {
        const stderrOutput = Buffer.concat(stderrBuffers).toString("utf-8").trim();
        if (stderrOutput) {
          reject(new Error(`Failed to run oxlint: ${stderrOutput}`));
          return;
        }
      }
      resolve(output);
    });
  });

const parseOxlintOutput = (stdout: string): Diagnostic[] => {
  if (!stdout) return [];

  let output: OxlintOutput;
  try {
    output = JSON.parse(stdout) as OxlintOutput;
  } catch {
    throw new Error(
      `Failed to parse oxlint output: ${stdout.slice(0, ERROR_PREVIEW_LENGTH_CHARS)}`,
    );
  }

  return output.diagnostics
    .filter((diagnostic) => diagnostic.code && VUE_FILE_PATTERN.test(diagnostic.filename))
    .map((diagnostic) => {
      const { plugin, rule } = parseRuleCode(diagnostic.code);
      const primaryLabel = diagnostic.labels[0];

      const cleaned = cleanDiagnosticMessage(diagnostic.message, diagnostic.help, plugin, rule);

      return {
        filePath: diagnostic.filename,
        plugin,
        rule,
        severity: diagnostic.severity,
        message: cleaned.message,
        help: cleaned.help,
        line: primaryLabel?.span.line ?? 0,
        column: primaryLabel?.span.column ?? 0,
        category: resolveDiagnosticCategory(plugin, rule),
      };
    });
};

export const runOxlint = async (
  rootDirectory: string,
  hasTypeScript: boolean,
  framework: Framework,
  includePaths?: string[],
  nodeBinaryPath: string = process.execPath,
): Promise<Diagnostic[]> => {
  if (includePaths !== undefined && includePaths.length === 0) {
    return [];
  }

  const configPath = path.join(os.tmpdir(), `vue-doctor-oxlintrc-${process.pid}.json`);
  const pluginPath = resolvePluginPath();
  const config = createOxlintConfig({ pluginPath, framework });
  const restoreDisableDirectives = neutralizeDisableDirectives(rootDirectory);

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const oxlintBinary = resolveOxlintBinary();
    const baseArgs = [oxlintBinary, "-c", configPath, "--format", "json"];

    if (hasTypeScript) {
      baseArgs.push("--tsconfig", "./tsconfig.json");
    }

    const fileBatches =
      includePaths !== undefined ? batchIncludePaths(baseArgs, includePaths) : [["."]]

    const allDiagnostics: Diagnostic[] = [];
    for (const batch of fileBatches) {
      const batchArgs = [...baseArgs, ...batch];
      const stdout = await spawnOxlint(batchArgs, rootDirectory, nodeBinaryPath);
      allDiagnostics.push(...parseOxlintOutput(stdout));
    }

    return allDiagnostics;
  } finally {
    restoreDisableDirectives();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  }
};
