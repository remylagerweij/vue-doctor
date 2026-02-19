import fs from "node:fs";
import path from "node:path";
import type { VueDoctorConfig } from "../types.js";

const CONFIG_FILENAME = "vue-doctor.config.json";
const PACKAGE_JSON_KEY = "vueDoctor";

export const loadConfig = (directory: string): VueDoctorConfig | null => {
  const configFilePath = path.join(directory, CONFIG_FILENAME);
  if (fs.existsSync(configFilePath)) {
    try {
      const content = fs.readFileSync(configFilePath, "utf-8");
      return JSON.parse(content) as VueDoctorConfig;
    } catch {
      return null;
    }
  }

  const packageJsonPath = path.join(directory, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content) as Record<string, unknown>;
      if (packageJson[PACKAGE_JSON_KEY]) {
        return packageJson[PACKAGE_JSON_KEY] as VueDoctorConfig;
      }
    } catch {
      return null;
    }
  }

  return null;
};
