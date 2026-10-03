import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCustomTemplateRuleConfig, createOxlintConfig, createTemplateRuleConfig, getEnabledFsRules } from "../plugin/registry.js";
import type { ProjectInfo } from "../types.js";
import { findMonorepoRoot } from "../utils/find-monorepo-root.js";
import { listProjectSourceFiles } from "../utils/list-source-files.js";
import { resolvePluginPath } from "../utils/run-oxlint.js";
import { getToolVersions } from "../utils/tool-versions.js";
import { hashText } from "./cache.js";

/** Files whose content can change dead-code results without changing any source file. */
const DEAD_CODE_INPUT_FILES = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "knip.json",
  "knip.jsonc",
  ".knip.json",
  ".knip.jsonc",
  "knip.ts",
  "knip.config.ts",
  "knip.config.js",
  "tsconfig.json",
] as const;

const hashFileOrMissing = (filePath: string): string => {
  try {
    return hashText(fs.readFileSync(filePath));
  } catch {
    return "missing";
  }
};

/**
 * The code doing the analysis: the running bundle (dist/cli.js or dist/index.js, or this module
 * from source) plus the oxlint plugin bundle. Any change to Vue Doctor itself, released or not,
 * yields new keys.
 */
const hashOwnCode = (): string =>
  hashText([fileURLToPath(import.meta.url), resolvePluginPath()].map(hashFileOrMissing).join("|"));

export interface CacheContexts {
  lint: string;
  template: string;
  "dead-code": string;
  project: string;
}

export const computeCacheContexts = (directory: string, project: ProjectInfo): CacheContexts => {
  const tools = getToolVersions();
  const ownCode = hashOwnCode();
  const tsconfig = project.hasTypeScript ? hashFileOrMissing(path.join(directory, "tsconfig.json")) : "none";

  const lint = hashText(
    JSON.stringify({
      ownCode,
      oxlint: tools.oxlint,
      config: createOxlintConfig({ pluginPath: "", framework: project.framework }),
      tsconfig,
    }),
  );
  const template = hashText(
    JSON.stringify({
      ownCode,
      eslint: tools.eslint,
      eslintPluginVue: tools["eslint-plugin-vue"],
      parser: tools["vue-eslint-parser"],
      rules: { ...createTemplateRuleConfig(), ...createCustomTemplateRuleConfig(project.framework) },
      // Template ignores are derived from the root .gitignore.
      gitignore: hashFileOrMissing(path.join(directory, ".gitignore")),
    }),
  );
  // The file rules read the project through recorded inputs; their context is the code and the enabled set.
  const projectChecks = hashText(
    JSON.stringify({ ownCode, rules: getEnabledFsRules(project.framework).map((rule) => rule.ruleMeta) }),
  );
  return { lint, template, "dead-code": hashText(JSON.stringify({ ownCode, knip: tools.knip })), project: projectChecks };
};

/**
 * Key for a whole-project dead-code result: every source file's content plus manifests, lockfiles
 * and knip/TS config, for the project and (since knip analyses workspaces from there) the monorepo root.
 */
export const computeDeadCodeKey = (
  directory: string,
  context: string,
  /** Lets a caller that already listed the project share that result. */
  listSourceFiles: (root: string) => readonly string[] = listProjectSourceFiles,
): string => {
  const roots = [directory, findMonorepoRoot(directory)].filter((root): root is string => root !== null);
  const parts = [context];
  for (const root of roots) {
    for (const name of DEAD_CODE_INPUT_FILES) parts.push(`${name}:${hashFileOrMissing(path.join(root, name))}`);
    for (const relativePath of listSourceFiles(root)) {
      parts.push(`${relativePath}:${hashFileOrMissing(path.join(root, relativePath))}`);
    }
  }
  return hashText(parts.join("\n"));
};
