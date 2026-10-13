import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isNuxtClientFile } from "../src/plugin/client-bundle.js";
import { createOxlintConfig } from "../src/plugin/registry.js";
import { isJavascriptNoopUrl } from "../src/plugin/url-sinks.js";
import { detectProjectCapabilities } from "../src/utils/project-capabilities.js";

const PROPS_DESTRUCTURE_RULE = "vue-doctor/prefer-defineProps-destructure";
const roots: string[] = [];

const createProject = (files: Record<string, string>): string => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-capabilities-")));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
};

const withVue = (version: string, extra: Record<string, string> = {}): Record<string, string> => ({
  "package.json": JSON.stringify({ name: "app", dependencies: { vue: "latest" } }),
  "node_modules/vue/package.json": JSON.stringify({ name: "vue", version }),
  ...extra,
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("detectProjectCapabilities", () => {
  it("enables props destructure for the installed Vue 3.5, even when package.json says latest", () => {
    expect(detectProjectCapabilities(createProject(withVue("3.5.43"))).has("props-destructure")).toBe(true);
  });

  it("does not enable it for Vue 3.4", () => {
    expect(detectProjectCapabilities(createProject(withVue("3.4.38"))).has("props-destructure")).toBe(false);
  });

  it("falls back to the declared range when Vue is not installed", () => {
    const root = createProject({ "package.json": JSON.stringify({ dependencies: { vue: "^3.5.0" } }) });
    expect(detectProjectCapabilities(root).has("props-destructure")).toBe(true);
  });

  it("respects propsDestructure: false in nuxt.config and an explicit opt-in on 3.4", () => {
    const disabled = createProject(
      withVue("3.5.0", { "nuxt.config.ts": "export default defineNuxtConfig({ vue: { propsDestructure: false } })\n" }),
    );
    const enabled = createProject(withVue("3.4.0", { "vite.config.ts": "vue({ script: { propsDestructure: true } })\n" }));
    expect(detectProjectCapabilities(disabled).has("props-destructure")).toBe(false);
    expect(detectProjectCapabilities(enabled).has("props-destructure")).toBe(true);
  });

  it("keeps a rule that requires a capability out of the oxlint config when the project lacks it", () => {
    const rulesWith = (capabilities?: ReadonlySet<"props-destructure">) =>
      Object.keys(createOxlintConfig({ pluginPath: "", framework: "nuxt", capabilities }).rules);
    expect(rulesWith(new Set())).not.toContain(PROPS_DESTRUCTURE_RULE);
    expect(rulesWith(new Set(["props-destructure"]))).toContain(PROPS_DESTRUCTURE_RULE);
    expect(rulesWith(undefined)).toContain(PROPS_DESTRUCTURE_RULE);
  });
});

describe("isNuxtClientFile", () => {
  it("anchors on nuxt.config: app/ is the client bundle, scripts/ and server/ are not", () => {
    const root = createProject({ "nuxt.config.ts": "export default {}\n", "app/app.vue": "" });
    expect(isNuxtClientFile(`${root}/app/components/Foo.vue`)).toBe(true);
    expect(isNuxtClientFile(`${root}/app/app.vue`)).toBe(true);
    expect(isNuxtClientFile(`${root}/scripts/backup.ts`)).toBe(false);
    expect(isNuxtClientFile(`${root}/server/utils/db.ts`)).toBe(false);
    expect(isNuxtClientFile(`${root}/components/Legacy.vue`)).toBe(false);
  });

  it("treats a layer without app/ by its src/ or root directories", () => {
    const root = createProject({ "nuxt.config.ts": "export default {}\n" });
    expect(isNuxtClientFile(`${root}/src/components/Badge.vue`)).toBe(true);
    expect(isNuxtClientFile(`${root}/composables/useX.ts`)).toBe(true);
    expect(isNuxtClientFile(`${root}/test/stubs.ts`)).toBe(false);
  });
});

describe("isJavascriptNoopUrl", () => {
  it("matches do-nothing placeholders only", () => {
    for (const value of ["javascript:void(0)", "javascript:void 0;", "JavaScript:;", " javascript:void(0);"]) {
      expect(isJavascriptNoopUrl(value), value).toBe(true);
    }
    for (const value of ["javascript:alert(1)", "javascript:void(fetch('/x'))", "https://example.com"]) {
      expect(isJavascriptNoopUrl(value), value).toBe(false);
    }
  });
});
