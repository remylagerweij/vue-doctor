import { getFilename } from "./helpers.js";
import { toProjectRelative } from "./test-files.js";
import type { RuleContext } from "./types.js";

/** What the host passes to rules as `settings["vue-doctor"]` (see `createOxlintConfig`). */
export interface VueDoctorSettings {
  framework?: string;
}

export const SETTINGS_KEY = "vue-doctor";

export const getVueDoctorSettings = (context: RuleContext): VueDoctorSettings => {
  const settings = context.settings?.[SETTINGS_KEY];
  return typeof settings === "object" && settings !== null ? (settings as VueDoctorSettings) : {};
};

export const isNuxtContext = (context: RuleContext): boolean => getVueDoctorSettings(context).framework === "nuxt";

const PAGE_FILE_PATTERN = /(?:^|\/)pages\/(.+)\.(?:vue|[jt]sx)$/;
const LAYOUT_FILE_PATTERN = /(?:^|\/)layouts\/.+\.(?:vue|[jt]sx)$/;
const APP_ENTRY_PATTERN = /(?:^|\/)(?:app|error)\.vue$/;
const COMPONENTS_SEGMENT_PATTERN = /(?:^|\/)components\//;

const relativeFilename = (context: RuleContext): string => toProjectRelative(getFilename(context));

/** `app.vue`, `error.vue`, pages and layouts: Nuxt renders them inside `<Suspense>`. */
export const isNuxtSuspenseEntry = (context: RuleContext): boolean => {
  const filename = relativeFilename(context);
  if (COMPONENTS_SEGMENT_PATTERN.test(filename)) return false;
  return PAGE_FILE_PATTERN.test(filename) || LAYOUT_FILE_PATTERN.test(filename) || APP_ENTRY_PATTERN.test(filename);
};
