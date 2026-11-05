import { getFilename } from "./helpers.js";
import { toProjectRelative } from "./test-files.js";
import type { RuleContext } from "./types.js";

export interface NuxtRouteRule {
  path: string;
  ssr: boolean;
}

/** What the host passes to rules as `settings["vue-doctor"]` (see `createOxlintConfig`). */
export interface VueDoctorSettings {
  framework?: string;
  nuxt?: {
    /** Top-level `ssr` of nuxt.config; `false` makes the whole app client-rendered. */
    ssr?: boolean;
    /** `routeRules` entries that set `ssr`, in config order. */
    routeRules?: NuxtRouteRule[];
    /** Custom `srcDir` from nuxt.config (when explicitly set). */
    srcDir?: string;
    /** Custom `serverDir` from nuxt.config (when explicitly set). */
    serverDir?: string;
    /** Custom `dir.pages` from nuxt.config (when explicitly set). */
    pagesDir?: string;
    /** Custom `dir.layouts` from nuxt.config (when explicitly set). */
    layoutsDir?: string;
  };
}

export const SETTINGS_KEY = "vue-doctor";

export const getVueDoctorSettings = (context: RuleContext): VueDoctorSettings => {
  const settings = context.settings?.[SETTINGS_KEY];
  return typeof settings === "object" && settings !== null ? (settings as VueDoctorSettings) : {};
};

export const isNuxtContext = (context: RuleContext): boolean => getVueDoctorSettings(context).framework === "nuxt";

const APP_ENTRY_PATTERN = /(?:^|\/)(?:app|error)\.vue$/;
const COMPONENTS_SEGMENT_PATTERN = /(?:^|\/)components\//;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanDirSegment = (dir: string | undefined, fallback: string): string =>
  (dir ? dir.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "") : "") || fallback;

const matchNuxtDirEntry = (filename: string, dirName: string): RegExpExecArray | null =>
  new RegExp(`(?:^|/)${escapeRegExp(dirName)}/(.+)\\.(?:vue|[jt]sx)$`).exec(filename);

const relativeFilename = (context: RuleContext): string => toProjectRelative(getFilename(context));

/** `app.vue`, `error.vue`, pages and layouts: Nuxt renders them inside `<Suspense>`. */
export const isNuxtSuspenseEntry = (context: RuleContext): boolean => {
  const filename = relativeFilename(context);
  if (COMPONENTS_SEGMENT_PATTERN.test(filename)) return false;
  const nuxt = getVueDoctorSettings(context).nuxt;
  const pagesDir = cleanDirSegment(nuxt?.pagesDir, "pages");
  const layoutsDir = cleanDirSegment(nuxt?.layoutsDir, "layouts");
  return (
    matchNuxtDirEntry(filename, pagesDir) !== null ||
    matchNuxtDirEntry(filename, layoutsDir) !== null ||
    APP_ENTRY_PATTERN.test(filename)
  );
};

type RouteSegment = { kind: "static"; value: string } | { kind: "param" } | { kind: "catchAll" };

const toRouteSegments = (pagePath: string): RouteSegment[] => {
  const segments: RouteSegment[] = [];
  const parts = pagePath.split("/").filter((part) => !/^\(.*\)$/.test(part));
  parts.forEach((part, index) => {
    if (index === parts.length - 1 && part === "index") return;
    if (/^\[\.\.\..*\]$/.test(part)) segments.push({ kind: "catchAll" });
    else if (part.includes("[")) segments.push({ kind: "param" });
    else segments.push({ kind: "static", value: part });
  });
  return segments;
};

// Mirrors Nitro's radix3 matcher: `*` is one segment, a trailing `**` is zero or more.
const ruleMatchesPage = (rulePath: string, page: RouteSegment[]): boolean => {
  const ruleSegments = rulePath.split("/").filter(Boolean);
  for (let index = 0; index < ruleSegments.length; index++) {
    const ruleSegment = ruleSegments[index];
    if (ruleSegment === "**") return index === ruleSegments.length - 1;
    const pageSegment = page[index];
    if (!pageSegment || pageSegment.kind === "catchAll") return false;
    if (ruleSegment === "*" || ruleSegment.startsWith(":")) continue;
    if (pageSegment.kind !== "static" || pageSegment.value !== ruleSegment) return false;
  }
  return ruleSegments.length === page.length;
};

const specificity = (rulePath: string): number => {
  const segments = rulePath.split("/").filter(Boolean);
  const wildcards = segments.filter((segment) => segment === "*" || segment === "**" || segment.startsWith(":")).length;
  return segments.length * 4 - wildcards * 2 - (segments.includes("**") ? 1 : 0) + (wildcards === 0 ? 1000 : 0);
};

/** Whether this file is a page Nuxt never renders on the server (`ssr: false` in nuxt.config). */
export const isClientRenderedPage = (context: RuleContext): boolean => {
  const nuxt = getVueDoctorSettings(context).nuxt;
  if (!nuxt) return false;
  if (nuxt.ssr === false) return true;
  const filename = relativeFilename(context);
  if (COMPONENTS_SEGMENT_PATTERN.test(filename)) return false;
  const pagesDir = cleanDirSegment(nuxt.pagesDir, "pages");
  const match = matchNuxtDirEntry(filename, pagesDir);
  if (!match || !nuxt.routeRules?.length) return false;
  const page = toRouteSegments(match[1]);
  let best: NuxtRouteRule | undefined;
  for (const rule of nuxt.routeRules) {
    if (!ruleMatchesPage(rule.path, page)) continue;
    if (!best || specificity(rule.path) >= specificity(best.path)) best = rule;
  }
  return best?.ssr === false;
};
