import fs from "node:fs";
import path from "node:path";

/**
 * Finds the nearest `pnpm-workspace.yaml` starting from `directory` and walking up.
 */
const findPnpmWorkspaceYaml = (directory: string): string | null => {
  let current = path.resolve(directory);
  while (true) {
    const candidate = path.join(current, "pnpm-workspace.yaml");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
};

/**
 * Resolves a pnpm 9 `catalog:` protocol dependency version from `pnpm-workspace.yaml`.
 * Supports `catalog:` (default catalog) and `catalog:<name>`.
 */
export const resolvePnpmCatalogVersion = (
  directory: string,
  catalogRef: string,
  packageName: string,
): string | null => {
  if (!catalogRef.startsWith("catalog:")) return catalogRef;

  const catalogName = catalogRef.slice("catalog:".length).trim() || "default";
  const workspaceYamlPath = findPnpmWorkspaceYaml(directory);

  if (!workspaceYamlPath) return null;

  let content: string;
  try {
    content = fs.readFileSync(workspaceYamlPath, "utf-8");
  } catch {
    return null;
  }

  const lines = content.split("\n");
  let currentSection: "catalog" | "catalogs" | null = null;
  let inCatalog = false;

  const escapedPkg = packageName.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  const pkgRegex = new RegExp(
    `^\\s*(?:['"]?${escapedPkg}['"]?)\\s*:\\s*['"]?([^#'"\\s]+)['"]?`,
  );

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) continue;

    // Top-level sections: no indentation
    if (/^[a-zA-Z0-9_-]+:/.test(line)) {
      if (line.startsWith("catalog:")) {
        currentSection = "catalog";
        inCatalog = catalogName === "default";
      } else if (line.startsWith("catalogs:")) {
        currentSection = "catalogs";
        inCatalog = false;
      } else {
        currentSection = null;
        inCatalog = false;
      }
      continue;
    }

    if (currentSection === "catalogs") {
      const subMatch = /^ {2}([a-zA-Z0-9_-]+):/.exec(line);
      if (subMatch) {
        inCatalog = subMatch[1] === catalogName;
        continue;
      }
    }

    if (inCatalog) {
      const match = pkgRegex.exec(line);
      if (match) return match[1];
    }
  }

  return null;
};

