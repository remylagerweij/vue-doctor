import type { Framework } from "../types.js";
import { isAuditRule, type DefinedAuditRule } from "./define-audit-rule.js";
import { isFsRule, type DefinedFsRule } from "./define-fs-rule.js";
import type { DefinedRule, RuleCategory, RuleEngine, RuleMeta } from "./define-rule.js";
import { ruleModules } from "./rules/index.js";
import { CUSTOM_TEMPLATE_RULES, CUSTOM_TEMPLATE_PLUGIN_NAME } from "./custom-template-rules.js";
import { TEMPLATE_RULES } from "./template-rules.js";

/**
 * Plugin name oxlint knows the custom rules by. Oxlint sees the flat rule name (`vue-doctor/<rule>`);
 * everything user-facing uses the canonical ID (`vue-doctor/<category>/<rule>`, see `getCanonicalRuleId`).
 */
export const PLUGIN_NAME = "vue-doctor";

/** `plugin` value findings from eslint-plugin-vue carry. */
const TEMPLATE_PLUGIN_NAME = "eslint-plugin-vue";

export const OXLINT_RULES: readonly DefinedRule[] = ruleModules.filter(
  (rule): rule is DefinedRule => !isFsRule(rule) && !isAuditRule(rule),
);

/** Project-file rules, run by the "project" analyzer rather than by oxlint. */
export const FS_RULES: readonly DefinedFsRule[] = ruleModules.filter(isFsRule);

/** Rules backed by the opt-in dependency audit; they have no implementation here. */
export const AUDIT_RULES: readonly DefinedAuditRule[] = ruleModules.filter(isAuditRule);

/** Every registered rule, oxlint rules first, then template rules. */
export const RULE_REGISTRY: readonly RuleMeta[] = [
  ...OXLINT_RULES.map((rule) => rule.ruleMeta),
  ...FS_RULES.map((rule) => rule.ruleMeta),
  ...AUDIT_RULES.map((rule) => rule.ruleMeta),
  ...TEMPLATE_RULES,
];

/** Kebab-case category slug; for oxlint rules it equals the directory under `src/plugin/rules/`. */
export const categorySlug = (category: RuleCategory): string =>
  category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * The public rule ID: `vue-doctor/<category-slug>/<rule>` for Vue Doctor's own rules; template rules
 * keep their eslint-plugin-vue ID (`vue/<rule>`).
 */
export const getCanonicalRuleId = (meta: RuleMeta): string =>
  meta.engine === "eslint-template" ? meta.id : `${PLUGIN_NAME}/${categorySlug(meta.category)}/${meta.id}`;

/** What `Diagnostic.rule` holds for an own rule (the canonical ID without the plugin prefix). */
export const toDiagnosticRule = (meta: RuleMeta): string => `${categorySlug(meta.category)}/${meta.id}`;

// Own rules of every engine (oxlint, fs and audit) share the `vue-doctor` plugin namespace.
const ownRuleMetas = [...OXLINT_RULES, ...FS_RULES, ...AUDIT_RULES].map((rule) => rule.ruleMeta);
const oxlintMetaById = new Map(ownRuleMetas.map((meta) => [meta.id, meta]));
const oxlintMetaByDiagnosticRule = new Map(ownRuleMetas.map((meta) => [toDiagnosticRule(meta), meta]));
const templateMetaById = new Map(TEMPLATE_RULES.map((meta) => [meta.id, meta]));

/**
 * Metadata for the rule a finding came from, or `undefined` for rules Vue Doctor does not own.
 * Own rules are found by flat name (`no-eval`, what oxlint reports) or by `<category>/<rule>`.
 */
export const getRuleMeta = (plugin: string, rule: string): RuleMeta | undefined => {
  if (plugin === PLUGIN_NAME) return oxlintMetaById.get(rule) ?? oxlintMetaByDiagnosticRule.get(rule);
  if (plugin === TEMPLATE_PLUGIN_NAME) return templateMetaById.get(rule);
  return undefined;
};

export const isEnabled = (meta: RuleMeta, framework: Framework): boolean => {
  if (meta.defaultSeverity === "off") return false;
  // `vue` rules run everywhere; Nuxt-only rules run only on Nuxt projects.
  return meta.frameworks.includes("vue") || (framework === "nuxt" && meta.frameworks.includes("nuxt"));
};

const toOxlintSeverity = (severity: "error" | "warning"): "error" | "warn" =>
  severity === "error" ? "error" : "warn";

interface OxlintConfigOptions {
  pluginPath: string;
  framework: Framework;
}

export const createOxlintConfig = ({ pluginPath, framework }: OxlintConfigOptions) => {
  const rules: Record<string, "error" | "warn"> = {};
  for (const { ruleMeta: meta } of OXLINT_RULES) {
    if (!isEnabled(meta, framework)) continue;
    rules[`${PLUGIN_NAME}/${meta.id}`] = toOxlintSeverity(meta.defaultSeverity as "error" | "warning");
  }

  return {
    categories: {
      correctness: "off",
      suspicious: "off",
      pedantic: "off",
      perf: "off",
      restriction: "off",
      style: "off",
      nursery: "off",
    },
    plugins: [],
    jsPlugins: [pluginPath],
    rules,
  };
};

/** The project-file rules that run by default on a project of this framework. */
export const getEnabledFsRules = (framework: Framework): DefinedFsRule[] =>
  FS_RULES.filter((rule) => isEnabled(rule.ruleMeta, framework));

/** ESLint `rules` record for the template rules (`vue/<rule>` to `error` or `warn`). */
export const createTemplateRuleConfig = (): Record<string, "error" | "warn"> => {
  const rules: Record<string, "error" | "warn"> = {};
  for (const meta of TEMPLATE_RULES) {
    if (meta.defaultSeverity === "off") continue;
    rules[meta.id] = toOxlintSeverity(meta.defaultSeverity);
  }
  return rules;
};

/**
 * ESLint `rules` record for Vue Doctor's own template rules (`vue-doctor/<rule>` to `error` or `warn`).
 * These share their registry entry with the oxlint rule of the same name, so the severity and the
 * framework gating come from that entry.
 */
export const createCustomTemplateRuleConfig = (framework: Framework = "vite"): Record<string, "error" | "warn"> => {
  const rules: Record<string, "error" | "warn"> = {};
  for (const name of Object.keys(CUSTOM_TEMPLATE_RULES)) {
    const meta = oxlintMetaById.get(name);
    if (!meta || !isEnabled(meta, framework)) continue;
    rules[`${CUSTOM_TEMPLATE_PLUGIN_NAME}/${name}`] = toOxlintSeverity(meta.defaultSeverity as "error" | "warning");
  }
  return rules;
};

interface RuleCounts {
  /** All registered rules, including ones that are off by default. */
  registered: number;
  /** Rules enabled by default on at least one framework. */
  enabled: number;
  byEngine: Record<RuleEngine, number>;
  /** Registered rules per display category. */
  byCategory: Partial<Record<RuleCategory, number>>;
}

export const getRuleCounts = (): RuleCounts => {
  const byEngine: Record<RuleEngine, number> = { oxlint: 0, "eslint-template": 0, fs: 0, audit: 0 };
  const byCategory: Partial<Record<RuleCategory, number>> = {};
  for (const meta of RULE_REGISTRY) {
    byEngine[meta.engine]++;
    byCategory[meta.category] = (byCategory[meta.category] ?? 0) + 1;
  }
  return {
    registered: RULE_REGISTRY.length,
    enabled: RULE_REGISTRY.filter((meta) => meta.defaultSeverity !== "off").length,
    byEngine,
    byCategory,
  };
};
