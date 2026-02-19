import fs from "node:fs";
import path from "node:path";
import type { WorkspacePackage } from "../types.js";
import { discoverVueSubprojects, listWorkspacePackages } from "./discover-project.js";
import { isMonorepoRoot } from "./find-monorepo-root.js";
import { prompts } from "./prompts.js";

export const selectProjects = async (
  directory: string,
  projectFilter?: string,
  shouldSkipPrompts: boolean = false,
): Promise<string[]> => {
  if (!isMonorepoRoot(directory)) {
    return [directory];
  }

  const packages = listWorkspacePackages(directory);
  if (packages.length === 0) {
    const subprojects = discoverVueSubprojects(directory);
    if (subprojects.length === 0) return [directory];
    return subprojects.map((pkg) => pkg.directory);
  }

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

  const choices = packages.map((pkg: WorkspacePackage) => ({
    title: pkg.name,
    value: pkg.directory,
    selected: true,
  }));

  const { selectedProjects } = await prompts({
    type: "multiselect",
    name: "selectedProjects",
    message: "Select Vue projects to scan:",
    choices,
  });

  if (!selectedProjects || selectedProjects.length === 0) {
    return [directory];
  }

  return selectedProjects;
};
