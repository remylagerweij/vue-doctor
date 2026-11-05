import fs from "node:fs";
import path from "node:path";
import type { VueDoctorConfig } from "../config/schema.js";
import {
  OXLINT_RULES,
   getCanonicalRuleId,
  getRuleMeta,
  type TemplateRuleOverride,
  type TemplateRuleOverrides,
} from "../plugin/registry.js";
import { resolveRuleKey } from "../plugin/rule-ids.js";
import { listWorkspaceDirectories } from "./discover-project.js";
import { findMonorepoRoot, isMonorepoRoot } from "./find-monorepo-root.js";

const MAX_CONFIG_FILE_BYTES = 512 * 1024;

/**
 * Looked up in ascending precedence order within a directory: legacy ESLint configs, flat ESLint
 * configs, then Oxlint configs. A project's own directory is applied on top of its monorepo root.
 */
const LINTER_CONFIG_FILENAMES = [
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.cjs",
  ".eslintrc.js",
  ".eslintrc.mjs",
  "eslint.config.cjs",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cts",
  "eslint.config.ts",
  "eslint.config.mts",
  ".oxlintrc.json",
  "oxlint.config.cjs",
  "oxlint.config.js",
  "oxlint.config.mjs",
  "oxlint.config.ts",
  "oxlint.config.mts",
] as const;

/** Categories that a foreign linter config (`eslint.config.*`, `.oxlintrc.json`) may never disable. */
const PROTECTED_CATEGORIES = new Set(["Security", "Supply Chain", "Server"]);

const TEST_OR_SCRIPT_FILE_PATTERN =
  /(?:^|\/)(?:tests?|__tests__|__mocks__|__fixtures__|e2e|cypress|playwright|scripts|stories)\b|\.(?:test|spec|cy|e2e|stories|story)\b/i;

const NON_VUE_EXTENSION_PATTERN = /\.(?:[cm]?[jt]sx?|jsonc?|ya?ml|md|css|scss|less|html)$/i;

export interface ProjectLinterConfig {
  /** Non-Security `vue/*` template rule overrides (`"off"` or `{ options }`). */
  templateRules: Record<string, TemplateRuleOverride>;
  /** Flat names and canonical IDs of non-Security/non-Server `vue-doctor/*` rules set to `"off"`. */
  disabledOwnRules: Set<string>;
  /** Config files (relative to the scanned directory) from which rule settings were read. */
  sources: string[];
}

type Token =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "word"; value: string }
  | { kind: "punct"; value: string }
  | { kind: "dynamic"; value: string };

export type StaticValue = string | number | boolean | null | StaticValue[] | StaticObject;
export interface StaticObject {
  [key: string]: StaticValue | undefined;
}

const REGEX_PRECEDING_WORDS = new Set([
  "return",
  "case",
  "throw",
  "typeof",
  "void",
  "delete",
  "in",
  "instanceof",
  "new",
  "yield",
  "await",
]);

const REGEX_PRECEDING_PUNCT = new Set([
  "(",
  "[",
  "{",
  ",",
  ":",
  ";",
  "=",
  "!",
  "&",
  "|",
  "?",
  "+",
  "-",
  "*",
  "%",
  "~",
  "^",
  "<",
  ">",
]);

const canStartRegex = (previous: Token | undefined): boolean => {
  if (!previous) return true;
  if (previous.kind === "punct") return REGEX_PRECEDING_PUNCT.has(previous.value);
  if (previous.kind === "word") return REGEX_PRECEDING_WORDS.has(previous.value);
  return false;
};

/**
 * Tokenizes JS/TS/JSON/JSONC source text without executing it. Comments and regex literals are
 * skipped; interpolated template literals become `dynamic` tokens so they are never mistaken for
 * static string values.
 */
const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index++;
    } else if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end === -1 ? source.length : end + 1;
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
    } else if (char === "/" && canStartRegex(tokens[tokens.length - 1])) {
      let cursor = index + 1;
      let inCharacterClass = false;
      while (cursor < source.length) {
        const current = source[cursor];
        if (current === "\\") {
          cursor += 2;
          continue;
        }
        if (current === "\n") break;
        if (current === "[") inCharacterClass = true;
        else if (current === "]") inCharacterClass = false;
        else if (current === "/" && !inCharacterClass) {
          cursor++;
          while (cursor < source.length && /[a-z]/i.test(source[cursor])) cursor++;
          break;
        }
        cursor++;
      }
      tokens.push({ kind: "dynamic", value: "" });
      index = cursor;
    } else if (char === '"' || char === "'" || char === "`") {
      let value = "";
      let cursor = index + 1;
      let depth = 0;
      let hasInterpolation = false;
      while (cursor < source.length && (source[cursor] !== char || depth > 0)) {
        if (source[cursor] === "\\") {
          value += source[cursor + 1] ?? "";
          cursor += 2;
          continue;
        }
        if (char === "`" && source.startsWith("${", cursor)) {
          hasInterpolation = true;
          depth++;
          cursor += 2;
          continue;
        }
        if (char === "`" && depth > 0 && source[cursor] === "}") {
          depth--;
          cursor++;
          continue;
        }
        value += source[cursor];
        cursor++;
      }
      tokens.push(hasInterpolation ? { kind: "dynamic", value: "" } : { kind: "string", value });
      index = cursor + 1;
    } else if (
      /\d/.test(char) ||
      (char === "-" && /\d/.test(source[index + 1] ?? "") && canStartRegex(tokens[tokens.length - 1]))
    ) {
      const match = /^-?\d+(?:\.\d+)?/.exec(source.slice(index, index + 64));
      if (match) {
        tokens.push({ kind: "number", value: Number(match[0]) });
        index += match[0].length;
      } else {
        tokens.push({ kind: "punct", value: char });
        index++;
      }
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

const OPENERS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

const stripTypeAssertion = (parts: Token[]): Token[] => {
  const assertionIndex = parts.findIndex(
    (token, idx) => idx > 0 && token.kind === "word" && (token.value === "as" || token.value === "satisfies"),
  );
  return assertionIndex === -1 ? parts : parts.slice(0, assertionIndex);
};

const skipToDelimiter = (tokens: Token[], start: number): number => {
  let index = start;
  let depth = 0;
  while (index < tokens.length) {
    const current = tokens[index];
    if (current.kind === "punct") {
      if (current.value in OPENERS) depth++;
      else if (current.value === "}" || current.value === "]" || current.value === ")") {
        if (depth === 0) break;
        depth--;
      } else if (current.value === "," && depth === 0) break;
    }
    index++;
  }
  return index;
};

const readValue = (tokens: Token[], start: number): [StaticValue | undefined, number] => {
  const token = tokens[start];
  if (token?.kind === "punct" && token.value === "{") {
    const [objectValue, afterObject] = readObject(tokens, start);
    const end = skipToDelimiter(tokens, afterObject);
    return [objectValue, end];
  }
  if (token?.kind === "punct" && token.value === "[") {
    const [arrayValue, afterArray] = readArray(tokens, start);
    const end = skipToDelimiter(tokens, afterArray);
    return [arrayValue, end];
  }

  const end = skipToDelimiter(tokens, start);
  const parts = stripTypeAssertion(tokens.slice(start, end));
  if (parts.length !== 1) return [undefined, end];
  const [only] = parts;
  if (only.kind === "string") return [only.value, end];
  if (only.kind === "number") return [only.value, end];
  if (only.kind === "word") {
    if (only.value === "true") return [true, end];
    if (only.value === "false") return [false, end];
    if (only.value === "null") return [null, end];
  }
  return [undefined, end];
};

const isOffSeverity = (value: StaticValue | undefined): boolean =>
  value === "off" || value === 0;

const readArray = (tokens: Token[], start: number): [StaticValue[] | undefined, number] => {
  const items: StaticValue[] = [];
  let hasDynamicItem = false;
  let index = start + 1;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.kind === "punct" && token.value === "]") {
      if (hasDynamicItem) {
        // Keep `["off", dynamicExpr]` recognisable as an off rule even when options are non-static.
        return [items.length > 0 && isOffSeverity(items[0]) ? ["off"] : undefined, index + 1];
      }
      return [items, index + 1];
    }
    if (token.kind === "punct" && token.value === ",") {
      index++;
      continue;
    }
    const [value, next] = readValue(tokens, index);
    if (value === undefined) {
      hasDynamicItem = true;
    } else {
      items.push(value);
    }
    index = next === index ? index + 1 : next;
  }

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
      const next = skipToDelimiter(tokens, index);
      index = next === index ? index + 1 : next;
    }
  }

  return [result, index];
};

const isStaticObject = (value: StaticValue | undefined): value is StaticObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface RuleBlock {
  files?: string[];
  rules: StaticObject;
}

const extractFilesList = (value: StaticValue | undefined): string[] | undefined => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string");
    return strings.length > 0 ? strings : undefined;
  }
  return undefined;
};

const collectRuleBlocks = (
  object: StaticObject,
  blocks: RuleBlock[],
  inheritedFiles?: string[],
): void => {
  const currentFiles = extractFilesList(object.files) ?? inheritedFiles;

  if (isStaticObject(object.rules)) {
    blocks.push({ files: currentFiles, rules: object.rules });
  }

  if (Array.isArray(object.overrides)) {
    for (const item of object.overrides) {
      if (isStaticObject(item)) collectRuleBlocks(item, blocks, currentFiles);
    }
  } else if (isStaticObject(object.overrides)) {
    const keys = Object.keys(object.overrides);
    if (keys.some((key) => key.includes("/"))) {
      blocks.push({ files: currentFiles, rules: object.overrides });
    } else {
      collectRuleBlocks(object.overrides, blocks, currentFiles);
    }
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "rules" || key === "overrides" || key === "files") continue;
    if (isStaticObject(value)) {
      collectRuleBlocks(value, blocks, currentFiles);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isStaticObject(item)) collectRuleBlocks(item, blocks, currentFiles);
      }
    }
  }
};

const OBJECT_LITERAL_PRECEDING_PUNCT = new Set(["(", "[", ",", ":", "=", "?", "&", "|"]);
const OBJECT_LITERAL_PRECEDING_WORDS = new Set(["return", "default", "yield"]);

const isObjectLiteralStart = (tokens: Token[], index: number): boolean => {
  if (index === 0) return true;
  const previous = tokens[index - 1];
  if (previous.kind === "punct") return OBJECT_LITERAL_PRECEDING_PUNCT.has(previous.value);
  if (previous.kind === "word") return OBJECT_LITERAL_PRECEDING_WORDS.has(previous.value);
  return false;
};

/** Extracts rule blocks in declaration order from a config file's source text. */
const parseRuleBlocksFromSource = (source: string): RuleBlock[] => {
  const tokens = tokenize(source);
  const blocks: RuleBlock[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    // `.overrideRules({ ... })` (used by @nuxt/eslint and @antfu/eslint-config) passes a rules map directly.
    if (
      token.kind === "word" &&
      token.value === "overrideRules" &&
      tokens[index + 1]?.kind === "punct" &&
      tokens[index + 1]?.value === "(" &&
      tokens[index + 2]?.kind === "punct" &&
      tokens[index + 2]?.value === "{"
    ) {
      const [rulesObject, next] = readObject(tokens, index + 2);
      blocks.push({ rules: rulesObject });
      index = next;
      continue;
    }

    if (token.kind === "punct" && token.value === "{" && isObjectLiteralStart(tokens, index)) {
      const [object, next] = readObject(tokens, index);
      collectRuleBlocks(object, blocks);
      index = next;
      continue;
    }

    index++;
  }

  return blocks;
};

const isTestOnlyPattern = (pattern: string): boolean => TEST_OR_SCRIPT_FILE_PATTERN.test(pattern);

const canMatchVueFile = (pattern: string): boolean => {
  if (isTestOnlyPattern(pattern)) return false;
  if (pattern.toLowerCase().includes("vue")) return true;
  return !NON_VUE_EXTENSION_PATTERN.test(pattern);
};

/** Whether a config block's `files` patterns apply to production `.vue` files. */
const appliesToVueFiles = (files: readonly string[] | undefined): boolean =>
  !files || files.length === 0 || files.some(canMatchVueFile);

/** Whether a config block's `files` patterns apply to production source files (not test-only). */
const appliesToProductionFiles = (files: readonly string[] | undefined): boolean =>
  !files || files.length === 0 || files.some((pattern) => !isTestOnlyPattern(pattern));

type ParsedRuleEntry =
  | { state: "off" }
  | { state: "on"; options: unknown[] };

const isOnSeverity = (value: StaticValue | undefined): boolean =>
  value === "warn" || value === "warning" || value === "error" || value === 1 || value === 2;

const parseLinterRuleEntry = (raw: StaticValue | undefined): ParsedRuleEntry | null => {
  if (isOffSeverity(raw)) return { state: "off" };
  if (isOnSeverity(raw)) return { state: "on", options: [] };
  if (Array.isArray(raw) && raw.length > 0) {
    const [severity, ...options] = raw;
    if (isOffSeverity(severity)) return { state: "off" };
    if (isOnSeverity(severity)) return { state: "on", options };
  }
  return null;
};

const normalizeTemplateRuleId = (rawKey: string): string =>
  rawKey.trim().replace(/^eslint-plugin-vue\//, "vue/");

const applyRuleBlocks = (blocks: readonly RuleBlock[], target: ProjectLinterConfig): boolean => {
  let matchedAnyRule = false;

  for (const block of blocks) {
    const allowVueRules = appliesToVueFiles(block.files);
    const allowOwnRules = appliesToProductionFiles(block.files);

    for (const [rawKey, rawValue] of Object.entries(block.rules)) {
      const entry = parseLinterRuleEntry(rawValue);
      if (!entry) continue;

      const templateKey = normalizeTemplateRuleId(rawKey);
      if (templateKey.startsWith("vue/")) {
        if (!allowVueRules) continue;
        const meta = getRuleMeta("eslint-plugin-vue", templateKey);
        if (!meta || PROTECTED_CATEGORIES.has(meta.category)) continue;
        matchedAnyRule = true;
        target.templateRules[meta.id] = entry.state === "off" ? "off" : { options: entry.options };
        continue;
      }

      const trimmedKey = rawKey.trim();
      if (!trimmedKey.toLowerCase().startsWith("vue-doctor/") || !allowOwnRules) continue;

      const resolution = resolveRuleKey(trimmedKey);
      const matchingOwnRules = OXLINT_RULES.filter((rule) =>
        resolution.matches(getCanonicalRuleId(rule.ruleMeta)),
      );
      for (const { ruleMeta } of matchingOwnRules) {
        if (PROTECTED_CATEGORIES.has(ruleMeta.category)) continue;
        matchedAnyRule = true;
        const canonicalId = getCanonicalRuleId(ruleMeta);
        if (entry.state === "off") {
          target.disabledOwnRules.add(ruleMeta.id);
          target.disabledOwnRules.add(canonicalId);
        } else {
          target.disabledOwnRules.delete(ruleMeta.id);
          target.disabledOwnRules.delete(canonicalId);
        }
      }
    }
  }

  return matchedAnyRule;
};

const readText = (filePath: string): string | null => {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_CONFIG_FILE_BYTES) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
};

const readDirectoryLinterConfig = (
  directory: string,
  baseDirectory: string,
  target: ProjectLinterConfig,
): void => {
  const packageJsonPath = path.join(directory, "package.json");
  const packageJsonText = readText(packageJsonPath);
  if (packageJsonText) {
    try {
      const parsed = JSON.parse(packageJsonText) as Record<string, unknown>;
      if (isStaticObject(parsed.eslintConfig as StaticValue | undefined)) {
        const blocks: RuleBlock[] = [];
        collectRuleBlocks(parsed.eslintConfig as StaticObject, blocks);
        if (applyRuleBlocks(blocks, target)) {
          target.sources.push(`${path.relative(baseDirectory, packageJsonPath) || "package.json"}#eslintConfig`);
        }
      }
    } catch {
      // Unparsable package.json is ignored here.
    }
  }

  for (const filename of LINTER_CONFIG_FILENAMES) {
    const filePath = path.join(directory, filename);
    const source = readText(filePath);
    if (source === null) continue;
    const blocks = parseRuleBlocksFromSource(source);
    if (applyRuleBlocks(blocks, target)) {
      const relative = path.relative(baseDirectory, filePath).split(path.sep).join("/");
      target.sources.push(relative || filename);
    }
  }
};

/**
 * Statically reads the project's ESLint and Oxlint config files (never executing them) and extracts
 * rule settings for Vue Doctor's template rules (`vue/*`) and non-Security own rules (`vue-doctor/*`).
 * Security, Supply Chain and Server rules can never be disabled or weakened by foreign linter configs.
 */
export const readProjectLinterConfig = (directory: string): ProjectLinterConfig => {
  const resolvedDirectory = path.resolve(directory);
  const result: ProjectLinterConfig = {
    templateRules: {},
    disabledOwnRules: new Set<string>(),
    sources: [],
  };

  if (!isMonorepoRoot(resolvedDirectory)) {
    const monorepoRoot = findMonorepoRoot(resolvedDirectory);
    if (monorepoRoot && listWorkspaceDirectories(monorepoRoot).includes(resolvedDirectory)) {
      readDirectoryLinterConfig(monorepoRoot, resolvedDirectory, result);
    }
  }

  readDirectoryLinterConfig(resolvedDirectory, resolvedDirectory, result);
  return result;
};

const isRuleEnabledInVueDoctorConfig = (
  canonicalRuleId: string,
  config: VueDoctorConfig | null | undefined,
): boolean => {
  if (!config) return false;
  let state: "on" | "off" | undefined;
  for (const preset of config.extends ?? []) {
    if (preset === "vue-doctor/recommended" || preset === "vue-doctor/strict") {
      state = "on";
    }
  }
  for (const [key, entry] of Object.entries(config.rules ?? {})) {
    if (resolveRuleKey(key).matches(canonicalRuleId)) {
      const severity = Array.isArray(entry) ? entry[0] : entry;
      state = severity === "off" ? "off" : "on";
    }
  }
  if ((config.ignore?.rules ?? []).some((key) => resolveRuleKey(key).matches(canonicalRuleId))) {
    return false;
  }
  return state === "on";
};

/**
 * Applies `vue-doctor.config.*` precedence on top of settings inferred from the project's ESLint /
 * Oxlint config: any rule explicitly enabled in `vue-doctor.config.*` stays enabled even if the
 * project's linter config turned it off.
 */
export const resolveEffectiveLinterConfig = (
  linterConfig: ProjectLinterConfig,
  vueDoctorConfig?: VueDoctorConfig | null,
): ProjectLinterConfig => {
  if (!vueDoctorConfig) return linterConfig;
  const hasDisabledTemplateRule = Object.values(linterConfig.templateRules).includes("off");
  if (!hasDisabledTemplateRule && linterConfig.disabledOwnRules.size === 0) {
    return linterConfig;
  }

  const templateRules: Record<string, TemplateRuleOverride> = {};
  for (const [ruleId, override] of Object.entries(linterConfig.templateRules)) {
    if (override === "off" && isRuleEnabledInVueDoctorConfig(ruleId, vueDoctorConfig)) {
      continue;
    }
    templateRules[ruleId] = override;
  }

  const disabledOwnRules = new Set<string>();
  for (const { ruleMeta } of OXLINT_RULES) {
    const canonicalId = getCanonicalRuleId(ruleMeta);
    if (!linterConfig.disabledOwnRules.has(ruleMeta.id) && !linterConfig.disabledOwnRules.has(canonicalId)) {
      continue;
    }
    if (isRuleEnabledInVueDoctorConfig(canonicalId, vueDoctorConfig)) {
      continue;
    }
    disabledOwnRules.add(ruleMeta.id);
    disabledOwnRules.add(canonicalId);
  }

  return {
    templateRules,
    disabledOwnRules,
    sources: linterConfig.sources,
  };
};

/** Drops custom option tuples while keeping `"off"` entries, used as a fallback if ESLint rejects an option schema. */
export const stripTemplateRuleOptions = (overrides: TemplateRuleOverrides): TemplateRuleOverrides => {
  const stripped: Record<string, TemplateRuleOverride> = {};
  for (const [ruleId, override] of Object.entries(overrides)) {
    if (override === "off") stripped[ruleId] = "off";
  }
  return stripped;
};

