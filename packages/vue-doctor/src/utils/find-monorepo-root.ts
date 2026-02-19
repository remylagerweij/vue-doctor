import fs from "node:fs";
import path from "node:path";

export const isMonorepoRoot = (directory: string): boolean => {
  const packageJsonPath = path.join(directory, "package.json");
  if (!fs.existsSync(packageJsonPath)) return false;

  const pnpmWorkspacePath = path.join(directory, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWorkspacePath)) return true;

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    return Boolean(packageJson.workspaces);
  } catch {
    return false;
  }
};

export const findMonorepoRoot = (directory: string): string | null => {
  let currentDirectory = path.resolve(directory);

  while (true) {
    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) return null;
    currentDirectory = parentDirectory;

    if (isMonorepoRoot(currentDirectory)) return currentDirectory;
  }
};
