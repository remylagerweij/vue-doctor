import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/** Analyzer packages whose versions affect findings; reported by `--debug`. */
const TOOL_PACKAGES = ["oxlint", "eslint", "eslint-plugin-vue", "vue-eslint-parser", "knip"] as const;

/**
 * Finds a dependency's version without relying on `<name>/package.json` being exported: resolve
 * its entry point, then walk up to the package.json that carries the package name.
 */
const readPackageVersion = (name: string): string | null => {
  let entry: string;
  try {
    entry = require.resolve(name);
  } catch {
    return null;
  }
  let directory = path.dirname(entry);
  while (true) {
    const manifestPath = path.join(directory, "package.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as { name?: string; version?: string };
        if (manifest.name === name) return manifest.version ?? null;
      } catch {
        // Unreadable manifest: keep walking up.
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
};

export const getToolVersions = (): Record<string, string> =>
  Object.fromEntries(TOOL_PACKAGES.map((name) => [name, readPackageVersion(name) ?? "not installed"]));
