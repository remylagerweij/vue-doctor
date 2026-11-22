import { performance } from "node:perf_hooks";
import type { ESLint, Linter } from "eslint";
import { CUSTOM_TEMPLATE_PLUGIN_NAME, CUSTOM_TEMPLATE_RULES } from "../../src/plugin/custom-template-rules.js";
import { PLUGIN_NAME, createCustomTemplateRuleConfig, createTemplateRuleConfig, getRuleMeta } from "../../src/plugin/registry.js";
import { SCRIPT_DEPENDENT_TEMPLATE_RULES } from "../../src/plugin/template-rules.js";
import { loadTypescriptParser } from "../../src/utils/load-typescript-parser.js";
import type { RuleTiming } from "./types.js";

// The template pass (eslint-plugin-vue plus Vue Doctor's own template rules) with the same flat
// config `runEslintVue` builds, run in-process on text so a rule that throws is attributed to the
// rule and the file. tests/rule-fuzzing.test.ts compares this against the production runner so the
// two cannot drift apart.
//
// Timing: eslint-plugin-vue walks a template once for all rules, and ESLint's per-rule `stats` bill
// that walk to whichever rule is listed first (and add heavy overhead), so rules are not timed
// during the normal run. `lint` measures the whole file; `isolate` re-lints one rule at a time to
// attribute the cost of a file that was over budget.

export interface TemplateFile {
  filename: string;
  code: string;
}

export interface TemplateFinding {
  /** Flat rule id: `vue/<rule>` for eslint-plugin-vue, the bare name for Vue Doctor's own rules. */
  rule: string;
  line: number;
  message: string;
}

export interface TemplateFileResult {
  findings: TemplateFinding[];
  /** Fatal parse errors of the first pass (a script that does not parse). */
  problems: string[];
  /** Wall-clock time to parse and lint the file with every rule. */
  ms: number;
  /** Set when a rule (or the parser) threw while linting this file. */
  crash?: { rule: string; message: string };
}

export interface TemplateIsolation {
  /** Time to parse the file with no rule enabled (best of a few runs, so garbage collection does not count). */
  parseMs: number;
  /** Time to parse and lint with every rule enabled (best of a few runs). */
  fullMs: number;
  /** Per rule, the time it adds on top of parsing (best of a few runs). */
  rules: RuleTiming[];
}

export interface TemplateLinter {
  lint: (file: TemplateFile) => Promise<TemplateFileResult>;
  isolate: (file: TemplateFile) => Promise<TemplateIsolation>;
  /**
   * An independent second measurement of the cost of the given rules (flat ids; `*` is every rule
   * together). Parsing and linting alternate attempt by attempt, so a noisy parse cannot be mistaken
   * for the cost of a rule; the cost is the best linting time minus the best parsing time.
   */
  confirm: (file: TemplateFile, rules: readonly string[], attempts: number) => Promise<TemplateIsolation>;
}

type RuleConfig = Record<string, unknown>;

const OWN_PREFIX = `${CUSTOM_TEMPLATE_PLUGIN_NAME}/`;
const toFlatRule = (ruleId: string): string => (ruleId.startsWith(OWN_PREFIX) ? ruleId.slice(OWN_PREFIX.length) : ruleId);

export const createTemplateLinter = async (): Promise<TemplateLinter> => {
  const [{ ESLint: EslintClass }, { default: pluginVue }, espree] = await Promise.all([
    import("eslint"),
    import("eslint-plugin-vue"),
    import("espree"),
  ]);
  const typescriptParser = loadTypescriptParser();
  const templateExpressionParser = {
    parse: (code: string, options: Linter.ParserOptions) => {
      try {
        return espree.parse(code, options as Parameters<typeof espree.parse>[1]);
      } catch {
        return typescriptParser.parse(code, options);
      }
    },
  };
  const templateRules: RuleConfig = createTemplateRuleConfig({}, "nuxt");
  const customRules: RuleConfig = createCustomTemplateRuleConfig("nuxt");

  const createEslint = (skipScriptParsing: boolean, upstreamRules: RuleConfig, ownRules: RuleConfig): ESLint => {
    const rules = skipScriptParsing
      ? Object.fromEntries(Object.entries(upstreamRules).filter(([ruleId]) => !SCRIPT_DEPENDENT_TEMPLATE_RULES.has(ruleId)))
      : upstreamRules;
    return new EslintClass({
      overrideConfigFile: true,
      allowInlineConfig: false,
      overrideConfig: [
        ...(pluginVue.configs["flat/base"] as Linter.Config[]),
        {
          files: ["**/*.vue"],
          languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            parserOptions: {
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
          plugins: { [CUSTOM_TEMPLATE_PLUGIN_NAME]: { rules: CUSTOM_TEMPLATE_RULES } },
          rules: { ...(rules as Linter.RulesRecord), ...(ownRules as Linter.RulesRecord), "vue/comment-directive": "off" },
        },
      ],
      cache: false,
      fix: false,
    });
  };
  const withScript = createEslint(false, templateRules, customRules);
  const withoutScript = createEslint(true, templateRules, customRules);

  const hasFatal = (result: ESLint.LintResult): boolean => result.messages.some((message) => message.fatal);

  const upstreamById = new Map(Object.entries(templateRules).map(([ruleId, severity]) => [ruleId, severity] as const));
  const ownById = new Map(Object.entries(customRules).map(([ruleId, severity]) => [toFlatRule(ruleId), [ruleId, severity] as const] as const));

  return {
    confirm: async ({ filename, code }, ruleIds, attempts) => {
      const skipScript = (await withScript.lintText(code, { filePath: filename })).some(hasFatal);
      const once = async (eslint: ESLint): Promise<number> => {
        const started = performance.now();
        await eslint.lintText(code, { filePath: filename });
        return performance.now() - started;
      };
      const parser = createEslint(skipScript, {}, {});
      let parseBest = Infinity;
      const measure = async (eslint: ESLint): Promise<number> => {
        let best = Infinity;
        for (let attempt = 0; attempt < attempts; attempt++) {
          parseBest = Math.min(parseBest, await once(parser));
          best = Math.min(best, await once(eslint));
        }
        return best;
      };
      const rules: RuleTiming[] = [];
      let fullMs = 0;
      for (const rule of ruleIds) {
        let eslint: ESLint | undefined;
        if (rule === "*") eslint = createEslint(skipScript, templateRules, customRules);
        else if (upstreamById.has(rule)) eslint = createEslint(skipScript, { [rule]: upstreamById.get(rule) }, {});
        else if (ownById.has(rule)) eslint = createEslint(skipScript, {}, { [ownById.get(rule)![0]]: ownById.get(rule)![1] });
        if (!eslint) continue;
        const best = await measure(eslint);
        if (rule === "*") fullMs = best;
        rules.push({ rule, file: filename, ms: best });
      }
      // Every measurement above was paired with fresh parses: subtract the best of all of them.
      return { parseMs: parseBest, fullMs, rules: rules.map((timing) => ({ ...timing, ms: Math.max(0, timing.ms - parseBest) })) };
    },

    lint: async ({ filename, code }) => {
      const result: TemplateFileResult = { findings: [], problems: [], ms: 0 };
      const started = performance.now();
      try {
        const [initial] = await withScript.lintText(code, { filePath: filename });
        let final = initial;
        if (hasFatal(initial)) {
          result.problems = initial.messages.filter((message) => message.fatal).map((message) => message.message);
          [final] = await withoutScript.lintText(code, { filePath: filename });
        }
        for (const message of final.messages) {
          if (message.fatal || !message.ruleId) continue;
          // Like the production runner, only findings of registered rules count.
          const isOwn = message.ruleId.startsWith(OWN_PREFIX);
          if (!getRuleMeta(isOwn ? PLUGIN_NAME : "eslint-plugin-vue", toFlatRule(message.ruleId))) continue;
          result.findings.push({ rule: toFlatRule(message.ruleId), line: message.line, message: message.message });
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        const rule = /Rule: "([^"]+)"/.exec(text)?.[1];
        result.crash = { rule: rule ? toFlatRule(rule) : "*", message: text.split("\n").slice(0, 6).join("\n") };
      }
      result.ms = performance.now() - started;
      return result;
    },

    isolate: async ({ filename, code }) => {
      let skipScript: boolean | undefined;
      const time = async (upstreamRules: RuleConfig, ownRules: RuleConfig): Promise<number> => {
        skipScript ??= (await withScript.lintText(code, { filePath: filename })).some(hasFatal);
        const eslint = createEslint(skipScript, upstreamRules, ownRules);
        let best = Infinity;
        for (let attempt = 0; attempt < 3; attempt++) {
          const started = performance.now();
          await eslint.lintText(code, { filePath: filename });
          best = Math.min(best, performance.now() - started);
          // Only a slow measurement is worth repeating; tiny ones are fine either way.
          if (best < 50) break;
        }
        return best;
      };
      const parseMs = await time({}, {});
      const fullMs = await time(templateRules, customRules);
      const rules: RuleTiming[] = [];
      for (const [ruleId, severity] of Object.entries(templateRules)) {
        rules.push({ rule: ruleId, file: filename, ms: Math.max(0, (await time({ [ruleId]: severity }, {})) - parseMs) });
      }
      for (const [ruleId, severity] of Object.entries(customRules)) {
        rules.push({ rule: toFlatRule(ruleId), file: filename, ms: Math.max(0, (await time({}, { [ruleId]: severity })) - parseMs) });
      }
      return { parseMs, fullMs, rules };
    },
  };
};
