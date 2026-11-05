import fs from "node:fs";
import path from "node:path";
import type { NuxtRouteRule, VueDoctorSettings } from "../plugin/nuxt-files.js";
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

interface Token {
  kind: "string" | "word" | "punct";
  value: string;
}

// Enough of a JS/TS tokenizer to read object literals in nuxt.config: strings, words, punctuation.
const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index++;
    } else if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
    } else if (char === '"' || char === "'" || char === "`") {
      let value = "";
      let cursor = index + 1;
      let depth = 0;
      while (cursor < source.length && (source[cursor] !== char || depth > 0)) {
        if (source[cursor] === "\\") {
          value += source[cursor + 1] ?? "";
          cursor += 2;
          continue;
        }
        if (char === "`" && source.startsWith("${", cursor)) depth++;
        else if (char === "`" && depth > 0 && source[cursor] === "}") depth--;
        value += source[cursor];
        cursor++;
      }
      tokens.push({ kind: "string", value });
      index = cursor + 1;
    } else if (/[\w$]/.test(char)) {
      const match = /^[\w$]+/.exec(source.slice(index, index + 256));
      const word = match ? match[0] : char;
      tokens.push({ kind: "word", value: word });
      index += word.length;
    } else {
      tokens.push({ kind: "punct", value: char });
      index++;
    }
  }
  return tokens;
};

type StaticValue = boolean | string | StaticObject | undefined;
interface StaticObject {
  [key: string]: StaticValue;
}

const OPENERS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

// Reads the value starting at tokens[start]; returns it (undefined when not static) and the next index.
const readValue = (tokens: Token[], start: number): [StaticValue, number] => {
  const token = tokens[start];
  if (token?.kind === "punct" && token.value === "{") return readObject(tokens, start);
  let index = start;
  let depth = 0;
  const parts: Token[] = [];
  while (index < tokens.length) {
    const current = tokens[index];
    if (current.kind === "punct") {
      if (current.value in OPENERS) depth++;
      else if (current.value === "}" || current.value === "]" || current.value === ")") {
        if (depth === 0) break;
        depth--;
      } else if (current.value === "," && depth === 0) break;
    }
    parts.push(current);
    index++;
  }
  if (parts.length !== 1) return [undefined, index];
  const [only] = parts;
  if (only.kind === "string") return [only.value, index];
  if (only.kind === "word" && (only.value === "true" || only.value === "false")) return [only.value === "true", index];
  return [undefined, index];
};

const readObject = (tokens: Token[], start: number): [StaticObject, number] => {
  const result: StaticObject = {};
  let index = start + 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.kind === "punct" && token.value === "}") return [result, index + 1];
    if (token.kind === "punct" && token.value === ",") {
      index++;
      continue;
    }
    const isKey = (token.kind === "string" || token.kind === "word") && tokens[index + 1]?.value === ":";
    if (isKey) {
      const [value, next] = readValue(tokens, index + 2);
      result[token.value] = value;
      index = next;
    } else {
      // Spread, shorthand or method: skip to the next top-level comma.
      const [, next] = readValue(tokens, index);
      index = next === index ? index + 1 : next;
    }
  }
  return [result, index];
};

const findConfigObject = (tokens: Token[]): StaticObject | null => {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const isDefineCall =
      token.kind === "word" && token.value === "defineNuxtConfig" && tokens[index + 1]?.value === "(" && tokens[index + 2]?.value === "{";
    if (isDefineCall) return readObject(tokens, index + 2)[0];
    const isExportDefault =
      token.kind === "word" && token.value === "export" && tokens[index + 1]?.value === "default" && tokens[index + 2]?.value === "{";
    if (isExportDefault) return readObject(tokens, index + 2)[0];
  }
  return null;
};

/** What rules need to know about how a Nuxt app renders, read statically from nuxt.config. */
export const readNuxtRenderSettings = (directory: string): NonNullable<VueDoctorSettings["nuxt"]> => {
  const configFile = findNuxtConfigFile(directory);
  if (!configFile) return {};
  let config: StaticObject | null;
  try {
    config = findConfigObject(tokenize(fs.readFileSync(configFile, "utf-8")));
  } catch {
    return {};
  }
  if (!config) return {};

  const settings: NonNullable<VueDoctorSettings["nuxt"]> = {};
  if (typeof config.ssr === "boolean") settings.ssr = config.ssr;
  if (typeof config.srcDir === "string") settings.srcDir = config.srcDir;
  if (typeof config.serverDir === "string") settings.serverDir = config.serverDir;
  const dir = config.dir;
  if (dir && typeof dir === "object") {
    if (typeof dir.pages === "string") settings.pagesDir = dir.pages;
    if (typeof dir.layouts === "string") settings.layoutsDir = dir.layouts;
  }
  const routeRules = config.routeRules;
  if (routeRules && typeof routeRules === "object") {
    const rules: NuxtRouteRule[] = [];
    for (const [rulePath, rule] of Object.entries(routeRules)) {
      if (rule && typeof rule === "object" && typeof rule.ssr === "boolean") rules.push({ path: rulePath, ssr: rule.ssr });
    }
    if (rules.length > 0) settings.routeRules = rules;
  }
  return settings;
};
