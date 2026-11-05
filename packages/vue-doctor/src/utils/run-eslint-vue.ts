import fs from "node:fs";
import path from "node:path";
import type { ESLint, Linter } from "eslint";
import { CUSTOM_TEMPLATE_PLUGIN_NAME, CUSTOM_TEMPLATE_RULES } from "../plugin/custom-template-rules.js";
import {
  PLUGIN_NAME,
  createCustomTemplateRuleConfig,
  createTemplateRuleConfig,
  getRuleMeta,
  toDiagnosticRule,
  type TemplateRuleConfigEntry,
  type TemplateRuleOverrides,
} from "../plugin/registry.js";
import { SCRIPT_DEPENDENT_TEMPLATE_RULES } from "../plugin/template-rules.js";
import type { Diagnostic, Framework } from "../types.js";
import { loadTypescriptParser } from "./load-typescript-parser.js";
import { readProjectLinterConfig, stripTemplateRuleOptions } from "./project-linter-config.js";

// Directory-form patterns so ESLint prunes these trees instead of walking them.
const ALWAYS_IGNORED_PATTERNS = [
  "**/node_modules/",
  "**/dist/",
  "**/.nuxt/",
  "**/.output/",
  "**/coverage/",
];

/**
 * Best-effort translation of the project's root `.gitignore` into ESLint `ignores` patterns.
 * Negations and escaped patterns are skipped; nested `.gitignore` files are not read.
 */
const readGitignorePatterns = (rootDirectory: string): string[] => {
  let content: string;
  try {
    content = fs.readFileSync(path.join(rootDirectory, ".gitignore"), "utf-8");
  } catch {
    return [];
  }

  const patterns: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("!") || line.includes("\\")) continue;

    const isDirectoryOnly = line.endsWith("/");
    const body = line.replace(/\/+$/, "");
    if (!body) continue;

    // A slash at the start or in the middle anchors the pattern to the .gitignore's directory.
    const base = body.includes("/") ? body.replace(/^\//, "") : `**/${body}`;
    patterns.push(`${base}/`);
    if (!isDirectoryOnly) patterns.push(base);
  }
  return patterns;
};

const toProjectRelativePath = (rootDirectory: string, filePath: string): string =>
  path.relative(rootDirectory, filePath).split(path.sep).join("/");

const resolveFilesToLint = (rootDirectory: string, includePaths: string[]): string[] =>
  includePaths
    .filter((filePath) => filePath.endsWith(".vue"))
    .map((filePath) => path.resolve(rootDirectory, filePath))
    .filter((absolutePath) => {
      const relativePath = path.relative(rootDirectory, absolutePath);
      return (
        !relativePath.startsWith("..") &&
        !path.isAbsolute(relativePath) &&
        fs.existsSync(absolutePath)
      );
    });

/**
 * Runs eslint-plugin-vue's template rules in-process with a flat config built on our own bundled
 * ESLint, plugin and parser. The scanned project's ESLint install and config are never executed
 * (non-Security `vue/*` rule overrides and options are read statically via `readProjectLinterConfig`).
 * Throws when ESLint itself fails so the caller can report the analyzer as skipped.
 */
export const runEslintVue = async (
  rootDirectory: string,
  includePaths?: string[],
  framework: Framework = "vite",
  templateRuleOverrides?: TemplateRuleOverrides,
): Promise<Diagnostic[]> => {
  let patterns: string[];
  if (includePaths) {
    patterns = resolveFilesToLint(rootDirectory, includePaths);
    if (patterns.length === 0) return [];
  } else {
    patterns = ["**/*.vue"];
  }

  // Lazy-loaded: ESLint and its plugin are heavy and unused when template checks are off.
  const [{ ESLint: EslintClass }, { default: pluginVue }, espree] = await Promise.all([
    import("eslint"),
    import("eslint-plugin-vue"),
    import("espree"),
  ]);

  const typescriptParser = loadTypescriptParser();
  // Template expressions are nearly always plain JS, which espree parses far faster than TypeScript.
  const templateExpressionParser = {
    parse: (code: string, options: Linter.ParserOptions) => {
      try {
        return espree.parse(code, options as Parameters<typeof espree.parse>[1]);
      } catch {
        return typescriptParser.parse(code, options);
      }
    },
  };
  const resolvedOverrides = templateRuleOverrides ?? readProjectLinterConfig(rootDirectory).templateRules;
  const hasCustomOptions = Object.values(resolvedOverrides).some(
    (entry) => entry !== "off" && entry.options.length > 0,
  );
  const customTemplateRules = createCustomTemplateRuleConfig(framework);
  const gitignorePatterns = readGitignorePatterns(rootDirectory);

  const createEslint = (
    skipScriptParsing: boolean,
    activeTemplateRules: Record<string, TemplateRuleConfigEntry>,
  ): ESLint => {
    const rulesForPass = skipScriptParsing
      ? Object.fromEntries(
          Object.entries(activeTemplateRules).filter(([ruleId]) => !SCRIPT_DEPENDENT_TEMPLATE_RULES.has(ruleId)),
        )
      : activeTemplateRules;

    return new EslintClass({
      cwd: rootDirectory,
      // Never load the project's eslint.config.* — only the config below applies.
      overrideConfigFile: true,
      // eslint-disable comments must not hide Vue Doctor findings (use vue-doctor-disable).
      allowInlineConfig: false,
      overrideConfig: [
        { ignores: [...ALWAYS_IGNORED_PATTERNS, ...gitignorePatterns] },
        ...(pluginVue.configs["flat/base"] as Linter.Config[]),
        {
          files: ["**/*.vue"],
          languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            parserOptions: {
              // `false` skips <script> so template rules survive a script that does not parse.
              parser: skipScriptParsing
                ? false
                : {
                    "<template>": templateExpressionParser,
                    ts: typescriptParser,
                    tsx: typescriptParser,
                    js: "espree",
                    jsx: "espree",
                  },
            },
          },
          linterOptions: { reportUnusedDisableDirectives: "off" },
          // Vue Doctor's own template rules (e.g. `v-html`), next to eslint-plugin-vue's.
          plugins: { [CUSTOM_TEMPLATE_PLUGIN_NAME]: { rules: CUSTOM_TEMPLATE_RULES } },
          rules: {
            ...(rulesForPass as Linter.RulesRecord),
            ...customTemplateRules,
            // eslint-plugin-vue applies <!-- eslint-disable --> template comments through this rule,
            // independently of allowInlineConfig. Off, so only vue-doctor-disable suppresses.
            "vue/comment-directive": "off",
          },
        },
      ],
      errorOnUnmatchedPattern: false,
      warnIgnored: false,
      cache: false,
      fix: false,
    });
  };

  const hasFatalMessage = (result: ESLint.LintResult): boolean =>
    result.messages.some((message) => message.fatal);

  const lintWithRules = async (
    activeTemplateRules: Record<string, TemplateRuleConfigEntry>,
  ): Promise<ESLint.LintResult[]> => {
    const initialResults = await createEslint(false, activeTemplateRules).lintFiles(patterns);
    // A script syntax error would drop every template finding in the file: retry without the script.
    const unparsableFiles = initialResults.filter(hasFatalMessage).map((result) => result.filePath);
    if (unparsableFiles.length === 0) return initialResults;

    const retried = await createEslint(true, activeTemplateRules).lintFiles(unparsableFiles);
    const retriedByPath = new Map(retried.map((result) => [result.filePath, result]));
    return initialResults.map((result) => retriedByPath.get(result.filePath) ?? result);
  };

  let results: ESLint.LintResult[];
  try {
    results = await lintWithRules(createTemplateRuleConfig(resolvedOverrides, framework));
  } catch (error) {
    if (hasCustomOptions) {
      // A malformed rule option in the project's ESLint config must not break the template pass.
      try {
        results = await lintWithRules(createTemplateRuleConfig(stripTemplateRuleOptions(resolvedOverrides), framework));
      } catch (fallbackError) {
        const reason = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`eslint-plugin-vue failed: ${reason}`);
      }
    } else {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`eslint-plugin-vue failed: ${reason}`);
    }
  }

  // Individual unparsable files are skipped below; failing on every file means the run is broken.
  const fatalResults = results.filter(hasFatalMessage);
  if (results.length > 0 && fatalResults.length === results.length) {
    const firstFatal = fatalResults[0].messages.find((message) => message.fatal);
    throw new Error(`eslint-plugin-vue could not parse any file: ${firstFatal?.message ?? "unknown error"}`);
  }

  const diagnostics: Diagnostic[] = [];
  for (const result of results) {
    const relativePath = toProjectRelativePath(rootDirectory, result.filePath);

    for (const message of result.messages) {
      if (message.fatal || !message.ruleId) continue;
      // Own template rules (`vue-doctor/<rule>`) are reported like oxlint findings of the same rule.
      const ownRuleName = message.ruleId.startsWith(`${CUSTOM_TEMPLATE_PLUGIN_NAME}/`)
        ? message.ruleId.slice(CUSTOM_TEMPLATE_PLUGIN_NAME.length + 1)
        : undefined;
      const meta = ownRuleName
        ? getRuleMeta(PLUGIN_NAME, ownRuleName)
        : getRuleMeta("eslint-plugin-vue", message.ruleId);
      if (!meta) continue;

      diagnostics.push({
        filePath: relativePath,
        plugin: ownRuleName ? PLUGIN_NAME : "eslint-plugin-vue",
        rule: ownRuleName ? toDiagnosticRule(meta) : message.ruleId,
        severity: message.severity === 2 ? "error" : "warning",
        message: message.message,
        help: meta.help,
        line: message.line,
        column: message.column,
        category: meta.category,
      });
    }
  }

  return diagnostics;
};
