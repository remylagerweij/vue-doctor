import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { GIT_LS_FILES_MAX_BUFFER_BYTES, SOURCE_FILE_PATTERN } from "../constants.js";
import type {
  DependencyInfo,
  Framework,
  PackageJson,
  ProjectInfo,
  WorkspacePackage,
} from "../types.js";
import { findMonorepoRoot, isMonorepoRoot } from "./find-monorepo-root.js";
import { readPackageJson } from "./read-package-json.js";

const NUXT_CONFIG_FILENAMES = [
  "nuxt.config.ts",
  "nuxt.config.js",
  "nuxt.config.mjs",
  "nuxt.config.cjs",
];

const VITE_CONFIG_FILENAMES = [
  "vite.config.js",
  "vite.config.ts",
  "vite.config.mjs",
  "vite.config.cjs",
];

const QUASAR_CONFIG_FILENAMES = [
  "quasar.config.js",
  "quasar.config.ts",
  "quasar.conf.js",
];

const VUE_CLI_CONFIG_FILENAMES = [
  "vue.config.js",
  "vue.config.ts",
  "vue.config.cjs",
];

const FRAMEWORK_PACKAGES: Record<string, Framework> = {
  nuxt: "nuxt",
  vite: "vite",
  quasar: "quasar",
  "@quasar/app-vite": "quasar",
  "@quasar/app-webpack": "quasar",
  "@vue/cli-service": "vuecli",
};

const FRAMEWORK_DISPLAY_NAMES: Record<Framework, string> = {
  nuxt: "Nuxt",
  vite: "Vite",
  quasar: "Quasar",
  vuecli: "Vue CLI",
  unknown: "Vue",
};

export const formatFrameworkName = (framework: Framework): string =>
  FRAMEWORK_DISPLAY_NAMES[framework];

const countSourceFiles = (rootDirectory: string): number => {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: rootDirectory,
    encoding: "utf-8",
    maxBuffer: GIT_LS_FILES_MAX_BUFFER_BYTES,
  });

  if (result.error || result.status !== 0) {
    return 0;
  }

  return result.stdout
    .split("\n")
    .filter((filePath) => filePath.length > 0 && SOURCE_FILE_PATTERN.test(filePath)).length;
};

const collectAllDependencies = (packageJson: PackageJson): Record<string, string> => ({
  ...packageJson.peerDependencies,
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
});

const detectFrameworkFromDependencies = (dependencies: Record<string, string>): Framework => {
  for (const [packageName, frameworkName] of Object.entries(FRAMEWORK_PACKAGES)) {
    if (dependencies[packageName]) {
      return frameworkName;
    }
  }
  return "unknown";
};

const detectFrameworkFromConfig = (directory: string): Framework => {
  for (const filename of NUXT_CONFIG_FILENAMES) {
    if (fs.existsSync(path.join(directory, filename))) return "nuxt";
  }
  for (const filename of QUASAR_CONFIG_FILENAMES) {
    if (fs.existsSync(path.join(directory, filename))) return "quasar";
  }
  for (const filename of VUE_CLI_CONFIG_FILENAMES) {
    if (fs.existsSync(path.join(directory, filename))) return "vuecli";
  }
  for (const filename of VITE_CONFIG_FILENAMES) {
    if (fs.existsSync(path.join(directory, filename))) return "vite";
  }
  return "unknown";
};

const extractDependencyInfo = (packageJson: PackageJson): DependencyInfo => {
  const allDependencies = collectAllDependencies(packageJson);
  return {
    vueVersion: allDependencies.vue ?? null,
    framework: detectFrameworkFromDependencies(allDependencies),
  };
};

const parsePnpmWorkspacePatterns = (rootDirectory: string): string[] => {
  const workspacePath = path.join(rootDirectory, "pnpm-workspace.yaml");
  if (!fs.existsSync(workspacePath)) return [];

  const content = fs.readFileSync(workspacePath, "utf-8");
  const patterns: string[] = [];
  let isInsidePackagesBlock = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "packages:") {
      isInsidePackagesBlock = true;
      continue;
    }
    if (isInsidePackagesBlock && trimmed.startsWith("-")) {
      patterns.push(trimmed.replace(/^-\s*/, "").replace(/["']/g, ""));
    } else if (isInsidePackagesBlock && trimmed.length > 0 && !trimmed.startsWith("#")) {
      isInsidePackagesBlock = false;
    }
  }

  return patterns;
};

const getWorkspacePatterns = (rootDirectory: string, packageJson: PackageJson): string[] => {
  const pnpmPatterns = parsePnpmWorkspacePatterns(rootDirectory);
  if (pnpmPatterns.length > 0) return pnpmPatterns;

  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces;
  }

  if (packageJson.workspaces?.packages) {
    return packageJson.workspaces.packages;
  }

  return [];
};

const resolveWorkspaceDirectories = (rootDirectory: string, pattern: string): string[] => {
  const cleanPattern = pattern.replace(/["']/g, "").replace(/\/\*\*$/, "/*");

  if (!cleanPattern.includes("*")) {
    const directoryPath = path.join(rootDirectory, cleanPattern);
    if (fs.existsSync(directoryPath) && fs.existsSync(path.join(directoryPath, "package.json"))) {
      return [directoryPath];
    }
    return [];
  }

  const wildcardIndex = cleanPattern.indexOf("*");
  const baseDirectory = path.join(rootDirectory, cleanPattern.slice(0, wildcardIndex));
  const suffixAfterWildcard = cleanPattern.slice(wildcardIndex + 1);

  if (!fs.existsSync(baseDirectory) || !fs.statSync(baseDirectory).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(baseDirectory)
    .map((entry) => path.join(baseDirectory, entry, suffixAfterWildcard))
    .filter(
      (entryPath) =>
        fs.existsSync(entryPath) &&
        fs.statSync(entryPath).isDirectory() &&
        fs.existsSync(path.join(entryPath, "package.json")),
    );
};

const hasVueDependency = (packageJson: PackageJson): boolean => {
  const allDependencies = collectAllDependencies(packageJson);
  return Object.keys(allDependencies).some(
    (packageName) => packageName === "vue" || packageName === "nuxt" || packageName.includes("vue"),
  );
};

const findVueInWorkspaces = (rootDirectory: string, packageJson: PackageJson): DependencyInfo => {
  const patterns = getWorkspacePatterns(rootDirectory, packageJson);
  const result: DependencyInfo = { vueVersion: null, framework: "unknown" };

  for (const pattern of patterns) {
    const directories = resolveWorkspaceDirectories(rootDirectory, pattern);

    for (const workspaceDirectory of directories) {
      const workspacePackageJson = readPackageJson(path.join(workspaceDirectory, "package.json"));
      const info = extractDependencyInfo(workspacePackageJson);

      if (info.vueVersion && !result.vueVersion) {
        result.vueVersion = info.vueVersion;
      }
      if (info.framework !== "unknown" && result.framework === "unknown") {
        result.framework = info.framework;
      }

      if (result.vueVersion && result.framework !== "unknown") {
        return result;
      }
    }
  }

  return result;
};

const findDependencyInfoFromMonorepoRoot = (directory: string): DependencyInfo => {
  const monorepoRoot = findMonorepoRoot(directory);
  if (!monorepoRoot) return { vueVersion: null, framework: "unknown" };

  const rootPackageJson = readPackageJson(path.join(monorepoRoot, "package.json"));
  const rootInfo = extractDependencyInfo(rootPackageJson);
  const workspaceInfo = findVueInWorkspaces(monorepoRoot, rootPackageJson);

  return {
    vueVersion: rootInfo.vueVersion ?? workspaceInfo.vueVersion,
    framework: rootInfo.framework !== "unknown" ? rootInfo.framework : workspaceInfo.framework,
  };
};

export const discoverVueSubprojects = (rootDirectory: string): WorkspacePackage[] => {
  if (!fs.existsSync(rootDirectory) || !fs.statSync(rootDirectory).isDirectory()) return [];

  const entries = fs.readdirSync(rootDirectory, { withFileTypes: true });
  const packages: WorkspacePackage[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }

    const subdirectory = path.join(rootDirectory, entry.name);
    const packageJsonPath = path.join(subdirectory, "package.json");
    if (!fs.existsSync(packageJsonPath)) continue;

    const packageJson = readPackageJson(packageJsonPath);
    if (!hasVueDependency(packageJson)) continue;

    const name = packageJson.name ?? entry.name;
    packages.push({ name, directory: subdirectory });
  }

  return packages;
};

export const listWorkspacePackages = (rootDirectory: string): WorkspacePackage[] => {
  const packageJsonPath = path.join(rootDirectory, "package.json");
  if (!fs.existsSync(packageJsonPath)) return [];

  const packageJson = readPackageJson(packageJsonPath);
  const patterns = getWorkspacePatterns(rootDirectory, packageJson);
  if (patterns.length === 0) return [];

  const packages: WorkspacePackage[] = [];

  for (const pattern of patterns) {
    const directories = resolveWorkspaceDirectories(rootDirectory, pattern);
    for (const workspaceDirectory of directories) {
      const workspacePackageJson = readPackageJson(path.join(workspaceDirectory, "package.json"));

      if (!hasVueDependency(workspacePackageJson)) continue;

      const name = workspacePackageJson.name ?? path.basename(workspaceDirectory);
      packages.push({ name, directory: workspaceDirectory });
    }
  }

  return packages;
};

export const discoverProject = (directory: string): ProjectInfo => {
  const packageJsonPath = path.join(directory, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${directory}`);
  }

  const packageJson = readPackageJson(packageJsonPath);
  let { vueVersion, framework } = extractDependencyInfo(packageJson);

  // Also try to detect framework from config files
  if (framework === "unknown") {
    framework = detectFrameworkFromConfig(directory);
  }

  if (!vueVersion || framework === "unknown") {
    const workspaceInfo = findVueInWorkspaces(directory, packageJson);
    if (!vueVersion && workspaceInfo.vueVersion) {
      vueVersion = workspaceInfo.vueVersion;
    }
    if (framework === "unknown" && workspaceInfo.framework !== "unknown") {
      framework = workspaceInfo.framework;
    }
  }

  if ((!vueVersion || framework === "unknown") && !isMonorepoRoot(directory)) {
    const monorepoInfo = findDependencyInfoFromMonorepoRoot(directory);
    if (!vueVersion) {
      vueVersion = monorepoInfo.vueVersion;
    }
    if (framework === "unknown") {
      framework = monorepoInfo.framework;
    }
  }

  const projectName = packageJson.name ?? path.basename(directory);
  const hasTypeScript = fs.existsSync(path.join(directory, "tsconfig.json"));
  const sourceFileCount = countSourceFiles(directory);

  return {
    rootDirectory: directory,
    projectName,
    vueVersion,
    framework,
    hasTypeScript,
    sourceFileCount,
  };
};
