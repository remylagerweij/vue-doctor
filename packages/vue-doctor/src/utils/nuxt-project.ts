import fs from "node:fs";
import path from "node:path";
import { listWorkspaceDirectories, NUXT_CONFIG_FILENAMES } from "./discover-project.js";
import { findMonorepoRoot } from "./find-monorepo-root.js";

export const findNuxtConfigFile = (directory: string): string | null => {
  for (const filename of NUXT_CONFIG_FILENAMES) {
    const filePath = path.join(directory, filename);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
};

/** Generated files knip's Nuxt plugin reads; it always looks in `.nuxt/`, whatever `buildDir` says. */
export const NUXT_KNIP_INPUT_FILES = [
  ".nuxt/tsconfig.json",
  ".nuxt/imports.d.ts",
  ".nuxt/components.d.ts",
  ".nuxt/types/nitro-routes.d.ts",
  ".nuxt/types/nitro-imports.d.ts",
] as const;

// Knip analyses a monorepo's workspaces together, so the cache key covers every Nuxt workspace.
const listRelatedNuxtProjects = (directory: string): string[] => {
  const projects = new Set<string>();
  if (findNuxtConfigFile(directory)) projects.add(path.resolve(directory));
  const monorepoRoot = findMonorepoRoot(directory);
  if (projects.size > 0 && monorepoRoot) {
    for (const workspace of [monorepoRoot, ...listWorkspaceDirectories(monorepoRoot)]) {
      if (findNuxtConfigFile(workspace)) projects.add(path.resolve(workspace));
    }
  }
  return [...projects].sort();
};

/** A Nuxt project in which `nuxi prepare` has not run: knip cannot resolve its auto-imports. */
export const isUnpreparedNuxtProject = (directory: string): boolean =>
  findNuxtConfigFile(directory) !== null && !fs.existsSync(path.join(directory, ".nuxt"));

/** The `.nuxt/` inputs of every related Nuxt project, for cache keys that must change after `nuxi prepare`. */
export const listNuxtKnipInputs = (directory: string): string[] => {
  const inputs: string[] = [];
  for (const project of listRelatedNuxtProjects(directory)) {
    for (const file of NUXT_KNIP_INPUT_FILES) inputs.push(path.join(project, file));
    const moduleDirectory = path.join(project, ".nuxt", "module");
    try {
      for (const entry of fs.readdirSync(moduleDirectory).sort()) {
        if (entry.endsWith(".d.ts")) inputs.push(path.join(moduleDirectory, entry));
      }
    } catch {
      // No generated module types.
    }
  }
  return inputs;
};
