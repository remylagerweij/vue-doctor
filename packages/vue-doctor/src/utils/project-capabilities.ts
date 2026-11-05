import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { ProjectCapability } from "../plugin/define-rule.js";
import { resolvePnpmCatalogVersion } from "./pnpm-catalog.js";
import { inferVueVersionFromNuxt, resolveTsconfigPath } from "./discover-project.js";
import { readNuxtRenderSettings } from "./nuxt-project.js";

const CONFIG_FILENAMES = [
  "nuxt.config.ts",
  "nuxt.config.js",
  "nuxt.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.mts",
];

const PROPS_DESTRUCTURE_OPTION = /\bpropsDestructure\s*:\s*(true|false)\b/;

const parseMinorVersion = (version: string | undefined): [number, number] | null => {
  const match = version ? /(\d+)\.(\d+)/.exec(version) : null;
  return match ? [Number(match[1]), Number(match[2])] : null;
};

const readJson = (filePath: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/** The installed Vue version, else the lowest version the `package.json` range allows. */
const resolveVueVersion = (directory: string): [number, number] | null => {
  try {
    const manifestPath = createRequire(path.join(directory, "package.json")).resolve("vue/package.json");
    const installed = parseMinorVersion(readJson(manifestPath)?.version as string | undefined);
    if (installed) return installed;
  } catch {
    // Not installed: fall back to the declared range.
  }
  const manifest = readJson(path.join(directory, "package.json"));
  for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
    let range = (manifest?.[section] as Record<string, string> | undefined)?.vue;
    if (range?.startsWith("catalog:")) {
      range = resolvePnpmCatalogVersion(directory, range, "vue") ?? undefined;
    }
    const parsed = parseMinorVersion(range);
    if (parsed) return parsed;
  }
  for (const section of ["dependencies", "devDependencies"]) {
    const nuxtRange = (manifest?.[section] as Record<string, string> | undefined)?.nuxt;
    if (nuxtRange) {
      const parsed = parseMinorVersion(inferVueVersionFromNuxt(nuxtRange));
      if (parsed) return parsed;
    }
  }
  return null;
};

const readPropsDestructureOption = (directory: string): boolean | null => {
  for (const filename of CONFIG_FILENAMES) {
    let source: string;
    try {
      source = fs.readFileSync(path.join(directory, filename), "utf8");
    } catch {
      continue;
    }
    const match = PROPS_DESTRUCTURE_OPTION.exec(source);
    if (match) return match[1] === "true";
  }
  return null;
};

const capabilitiesByDirectory = new Map<string, ReadonlySet<ProjectCapability>>();

/** What the project's toolchain supports, for rules that only apply on some setups (`RuleMeta.requires`). */
export const detectProjectCapabilities = (directory: string): ReadonlySet<ProjectCapability> => {
  const cached = capabilitiesByDirectory.get(directory);
  if (cached) return cached;
  const capabilities = new Set<ProjectCapability>();
  const version = resolveVueVersion(directory);
  const option = readPropsDestructureOption(directory);
  const isVue35 = version !== null && (version[0] > 3 || (version[0] === 3 && version[1] >= 5));
  if (option === true || (isVue35 && option !== false)) capabilities.add("props-destructure");

  const manifest = readJson(path.join(directory, "package.json"));
  const deps = {
    ...(manifest?.dependencies as Record<string, string> | undefined),
    ...(manifest?.devDependencies as Record<string, string> | undefined),
  };

  const hasTsConfig = resolveTsconfigPath(directory) !== null;
  const hasTsDep = Boolean(deps.typescript);
  if (hasTsConfig || hasTsDep) capabilities.add("typescript");

  const hasNuxtImageDep = Boolean(deps["@nuxt/image"] || deps["@nuxt/image-edge"]);
  let hasNuxtImageConfig = false;
  for (const filename of ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs", "nuxt.config.cjs"]) {
    try {
      const src = fs.readFileSync(path.join(directory, filename), "utf8");
      if (src.includes("@nuxt/image")) {
        hasNuxtImageConfig = true;
        break;
      }
    } catch {
      // Config file does not exist or cannot be read.
    }
  }
  if (hasNuxtImageDep || hasNuxtImageConfig) capabilities.add("nuxt-image");

  const nuxtSettings = readNuxtRenderSettings(directory);
  const isNuxtSpa = nuxtSettings.ssr === false;
  if (!isNuxtSpa) capabilities.add("ssr");

  capabilitiesByDirectory.set(directory, capabilities);
  return capabilities;
};
