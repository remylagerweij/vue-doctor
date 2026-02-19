import fs from "node:fs";
import type { PackageJson } from "../types.js";

export const readPackageJson = (packageJsonPath: string): PackageJson => {
  if (!fs.existsSync(packageJsonPath)) return {};
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson;
};
