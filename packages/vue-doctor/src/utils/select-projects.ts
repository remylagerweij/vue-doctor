import path from "node:path";
import type { WorkspacePackage } from "../types.js";
import { discoverVueSubprojects, getRootPackage, listWorkspacePackages } from "./discover-project.js";
import { isMonorepoRoot } from "./find-monorepo-root.js";
import { promptMultiselect } from "./prompts.js";

export const selectProjects = async (
  directory: string,
  projectFilter?: string,
  shouldSkipPrompts: boolean = false,
): Promise<string[]> => {
  if (!isMonorepoRoot(directory)) {
    return [directory];
  }

  const workspacePackages = listWorkspacePackages(directory);
  if (workspacePackages.length === 0) {
    const subprojects = discoverVueSubprojects(directory);
    if (subprojects.length === 0) return [directory];
    return subprojects.map((pkg) => pkg.directory);
  }

  // A root that is itself a Vue/Nuxt app is a project next to its workspaces (e.g. a Nuxt app with
  // only `docs` as a workspace); its own scan leaves the nested workspaces' files to them.
  const rootPackage = getRootPackage(directory);
  const packages = rootPackage ? [rootPackage, ...workspacePackages] : workspacePackages;

  if (projectFilter) {
    const requestedProjects = projectFilter.split(",").map((name) => name.trim());
    const matched = packages.filter((pkg) =>
      requestedProjects.includes(pkg.name) || requestedProjects.includes(path.basename(pkg.directory)),
    );
    return matched.length > 0 ? matched.map((pkg) => pkg.directory) : [directory];
  }

  if (shouldSkipPrompts) {
    return packages.map((pkg) => pkg.directory);
  }

  if (packages.length === 1) {
    return [packages[0].directory];
  }

  const selectedProjects = await promptMultiselect(
    "Select Vue projects to scan:",
    packages.map((pkg: WorkspacePackage) => ({ label: pkg.name, value: pkg.directory })),
  );

  if (selectedProjects.length === 0) {
    return [directory];
  }

  return selectedProjects;
};
