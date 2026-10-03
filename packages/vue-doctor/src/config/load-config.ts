import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import type { VueDoctorConfig } from "./schema.js";

/** Looked up in the project root only, in this order. More than one is an error. */
const CONFIG_FILENAMES = [
  "vue-doctor.config.ts",
  "vue-doctor.config.mts",
  "vue-doctor.config.js",
  "vue-doctor.config.mjs",
  "vue-doctor.config.json",
] as const;

const PACKAGE_JSON_KEY = "vueDoctor";

/** Hints for keys that users commonly get wrong (e.g. from 1.x docs). */
const KEY_HINTS: Record<string, string> = {
  "ignore.paths": 'use "ignore.files"',
  "gate.fail-on": 'use "gate.failOn"',
  "gate.min-score": 'use "gate.minScore"',
  "dead-code": 'use "deadCode"',
};

/** Thrown for unreadable, unparsable or invalid configuration. The CLI maps it to exit code 2. */
export class ConfigError extends Error {
  readonly filePath: string;
  readonly issues: string[];

  constructor(filePath: string, issues: string[]) {
    super(`Invalid Vue Doctor config in ${filePath}:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "ConfigError";
    this.filePath = filePath;
    this.issues = issues;
  }
}

export interface LoadedConfig {
  config: VueDoctorConfig;
  /** Absolute path of the file the config came from (`package.json` for the `vueDoctor` key). */
  filePath: string;
}

const formatPath = (segments: PropertyKey[]): string =>
  segments.map((segment) => (typeof segment === "number" ? `[${segment}]` : String(segment))).join(".");

const formatIssue = (issue: z.core.$ZodIssue): string[] => {
  const location = formatPath(issue.path);
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => {
      const fullKey = location ? `${location}.${key}` : key;
      const hint = KEY_HINTS[fullKey];
      return `unknown key "${fullKey}"${hint ? ` (${hint})` : ""}`;
    });
  }
  return [`${location || "(root)"}: ${issue.message}`];
};

/** zod is loaded on first use, so runs without a config never pay for it. */
export const validateConfig = async (value: unknown, filePath: string): Promise<VueDoctorConfig> => {
  const { configSchema } = await import("./schema.js");
  const result = configSchema.safeParse(value);
  if (!result.success) {
    throw new ConfigError(filePath, result.error.issues.flatMap(formatIssue));
  }
  return value as VueDoctorConfig;
};

const readJson = (filePath: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    throw new ConfigError(filePath, [error instanceof Error ? error.message : String(error)]);
  }
};

/** The package's own public entry, so `import { defineConfig } from "@remylagerweij/vue-doctor"` always resolves. */
const resolveOwnEntry = (): string => {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  // Built: dist/<chunk>.js → dist/index.js. Source (tests): src/config/ → src/index.ts.
  const candidates = [path.join(moduleDirectory, "index.js"), path.join(moduleDirectory, "..", "index.ts")];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "@remylagerweij/vue-doctor";
};

const importModuleConfig = async (filePath: string): Promise<unknown> => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(filePath, {
    moduleCache: false,
    alias: { "@remylagerweij/vue-doctor": resolveOwnEntry() },
  });
  try {
    const module = (await jiti.import(filePath)) as Record<string, unknown>;
    if (!("default" in module)) {
      throw new ConfigError(filePath, ["the config has no default export (use `export default defineConfig({...})`)"]);
    }
    return module.default;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(filePath, [
      `failed to load: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
};

/**
 * Loads and validates the project's config from `directory` (never from parent directories).
 * Returns `null` when the project has no config. Throws `ConfigError` when it is invalid.
 *
 * `.ts`/`.js` configs are executed (like ESLint or Vite configs); use JSON for untrusted code.
 */
export const loadConfig = async (directory: string): Promise<LoadedConfig | null> => {
  const found = CONFIG_FILENAMES.map((name) => path.join(directory, name)).filter((filePath) =>
    fs.existsSync(filePath),
  );

  if (found.length > 1) {
    throw new ConfigError(directory, [
      `found ${found.length} config files (${found.map((filePath) => path.basename(filePath)).join(", ")}); keep only one`,
    ]);
  }

  if (found.length === 1) {
    const filePath = found[0];
    const value = filePath.endsWith(".json") ? readJson(filePath) : await importModuleConfig(filePath);
    if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new ConfigError(filePath, ["the config must export default an object"]);
    }
    return { config: await validateConfig(value, filePath), filePath };
  }

  const packageJsonPath = path.join(directory, "package.json");
  if (!fs.existsSync(packageJsonPath)) return null;
  const packageJson = readJson(packageJsonPath) as Record<string, unknown> | null;
  const embedded = packageJson?.[PACKAGE_JSON_KEY];
  if (embedded === undefined) return null;
  return {
    config: await validateConfig(embedded, `${packageJsonPath}#${PACKAGE_JSON_KEY}`),
    filePath: packageJsonPath,
  };
};
