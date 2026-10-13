import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnose } from "../src/index.js";
import { isUnpreparedNuxtProject, listNuxtKnipInputs, readNuxtRenderSettings } from "../src/utils/nuxt-project.js";

const temporaryDirectories: string[] = [];
const makeTree = (files: Record<string, string | object>): string => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-nuxt-")));
  temporaryDirectories.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("readNuxtRenderSettings", () => {
  it("reads the routeRules that set ssr, ignoring everything else in the config", () => {
    const root = makeTree({
      "nuxt.config.ts": `import { defineNuxtConfig } from "nuxt/config"
const isDev = process.env.NODE_ENV !== "production"

export default defineNuxtConfig({
  modules: ["@pinia/nuxt", ["@nuxtjs/supabase", { redirect: false }]],
  // ssr: false would make the whole app client-rendered
  ssr: true,
  runtimeConfig: { public: { siteUrl: process.env.SITE_URL || "https://example.test" } },
  routeRules: {
    "/": { prerender: true },
    "/motoren": { ssr: false },
    '/account/**': { ssr: false, headers: { "cache-control": "no-store" } },
    "/merk/**": { isr: 3600, ssr: true },
    [\`/dynamic/\${"x"}\`]: { ssr: false },
    "/api/**": { cors: true },
    ...(isDev ? { "/dev/**": { ssr: false } } : {}),
  } as const,
  vite: { plugins: [] },
})
`,
    });
    expect(readNuxtRenderSettings(root)).toEqual({
      ssr: true,
      routeRules: [
        { path: "/motoren", ssr: false },
        { path: "/account/**", ssr: false },
        { path: "/merk/**", ssr: true },
      ],
    });
  });

  it("reads a top-level ssr: false and plain object exports", () => {
    const root = makeTree({ "nuxt.config.js": `export default { ssr: false, app: { head: { title: "SPA" } } }\n` });
    expect(readNuxtRenderSettings(root)).toEqual({ ssr: false });
  });

  it("returns nothing for a missing or unreadable config", () => {
    expect(readNuxtRenderSettings(makeTree({ "package.json": {} }))).toEqual({});
    expect(readNuxtRenderSettings(makeTree({ "nuxt.config.ts": "export default createConfig()\n" }))).toEqual({});
  });
});

describe("Nuxt preparation", () => {
  it("flags a Nuxt project without .nuxt/ until it is prepared", () => {
    const root = makeTree({ "package.json": { dependencies: { nuxt: "^4.0.0" } }, "nuxt.config.ts": "export default defineNuxtConfig({})\n" });
    expect(isUnpreparedNuxtProject(root)).toBe(true);
    fs.mkdirSync(path.join(root, ".nuxt"));
    expect(isUnpreparedNuxtProject(root)).toBe(false);
  });

  it("ignores projects that are not Nuxt", () => {
    expect(isUnpreparedNuxtProject(makeTree({ "package.json": { dependencies: { vue: "^3.5.0" } } }))).toBe(false);
  });

  it("keys the cache on the .nuxt/ inputs of every Nuxt workspace of a monorepo", () => {
    const root = makeTree({
      "package.json": { private: true, workspaces: ["apps/*", "packages/*"] },
      "apps/web/package.json": { name: "web", dependencies: { nuxt: "^4.0.0" } },
      "apps/web/nuxt.config.ts": "export default defineNuxtConfig({ extends: ['../../packages/ui'] })\n",
      "packages/ui/package.json": { name: "ui", dependencies: { vue: "^3.5.0" } },
      "packages/ui/nuxt.config.ts": "export default defineNuxtConfig({})\n",
      "packages/utils/package.json": { name: "utils" },
    });
    const owners = (directory: string) =>
      [...new Set(listNuxtKnipInputs(directory).map((input) => path.relative(root, input).split(path.sep).slice(0, 2).join("/")))];
    expect(owners(path.join(root, "packages/ui"))).toEqual(["apps/web", "packages/ui"]);
    expect(owners(path.join(root, "packages/utils"))).toEqual([]);
  });

  it("lists the generated files knip reads as cache inputs", () => {
    const root = makeTree({
      "nuxt.config.ts": "export default defineNuxtConfig({})\n",
      ".nuxt/module/nuxt-icon.d.ts": "export {}",
      ".nuxt/module/readme.md": "",
    });
    expect(listNuxtKnipInputs(root).map((input) => path.relative(root, input).split(path.sep).join("/"))).toEqual([
      ".nuxt/tsconfig.json",
      ".nuxt/imports.d.ts",
      ".nuxt/components.d.ts",
      ".nuxt/types/nitro-routes.d.ts",
      ".nuxt/types/nitro-imports.d.ts",
      ".nuxt/module/nuxt-icon.d.ts",
    ]);
  });
});

describe("dead code in a Nuxt project without .nuxt/", () => {
  const withCacheDirectory = async <T>(run: () => Promise<T>): Promise<T> => {
    const previous = process.env.VUE_DOCTOR_CACHE_DIR;
    process.env.VUE_DOCTOR_CACHE_DIR = makeTree({});
    try {
      return await run();
    } finally {
      if (previous === undefined) delete process.env.VUE_DOCTOR_CACHE_DIR;
      else process.env.VUE_DOCTOR_CACHE_DIR = previous;
    }
  };

  const makeNuxtApp = (): string =>
    makeTree({
      "package.json": { name: "nuxt-dead-code", private: true, dependencies: { nuxt: "^4.0.0", vue: "^3.5.0" } },
      "nuxt.config.ts": "export default defineNuxtConfig({})\n",
      "tsconfig.json": { extends: "./.nuxt/tsconfig.json" },
      "app/app.vue": "<template><NuxtPage /></template>\n",
      "app/pages/index.vue": "<template><PriceChart /></template>\n",
      "app/components/PriceChart.vue": "<template><div /></template>\n",
      "app/utils/format.ts": "export const formatPrice = (value: number) => `${value}`;\n",
    });

  it("skips unused files, exports and types, says to run nuxi prepare, and never caches that result", async () => {
    await withCacheDirectory(async () => {
      const directory = makeNuxtApp();
      const options = { lint: false, projectChecks: false } as const;

      const unprepared = await diagnose(directory, options);
      expect(unprepared.diagnostics.filter((diagnostic) => diagnostic.plugin === "knip" && diagnostic.rule !== "duplicates")).toEqual([]);
      expect(unprepared.skipped).toEqual([
        { analyzer: "dead-code", reason: expect.stringContaining("Run `nuxi prepare` first") },
      ]);
      expect(unprepared.skipped[0].reason).toContain("this Nuxt project has no .nuxt/ directory");
      expect((await diagnose(directory, options)).cache?.hits["dead-code"]).toBe(0);

      fs.mkdirSync(path.join(directory, ".nuxt"));
      fs.writeFileSync(path.join(directory, ".nuxt/tsconfig.json"), JSON.stringify({ compilerOptions: { paths: {} } }));
      const prepared = await diagnose(directory, options);
      expect(prepared.skipped).toEqual([]);
      expect(prepared.cache?.misses["dead-code"]).toBe(1);
      expect((await diagnose(directory, options)).cache?.hits["dead-code"]).toBe(1);

      fs.writeFileSync(path.join(directory, ".nuxt/components.d.ts"), "export {}\n");
      expect((await diagnose(directory, options)).cache?.misses["dead-code"]).toBe(1);
    });
  }, 240_000);
});
