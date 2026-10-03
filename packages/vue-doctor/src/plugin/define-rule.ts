import type { Rule, RuleContext, RuleVisitors } from "./types.js";

/** Display categories, in the order findings are grouped in reports. */
export const RULE_CATEGORIES = [
  "Reactivity",
  "Architecture",
  "Performance",
  "Security",
  "Supply Chain",
  "Bundle Size",
  "Correctness",
  "Ecosystem",
  "Nuxt",
  "Server",
  "Dead Code",
] as const;

export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export type RuleSeverity = "error" | "warning" | "off";

export type RuleConfidence = "high" | "medium" | "low";

export type RuleFramework = "vue" | "nuxt";

/**
 * Which analyzer runs the rule: oxlint (script AST), eslint-template (template AST), fs (project
 * files, see define-fs-rule.ts) or audit (opt-in network lookup, see define-audit-rule.ts).
 */
export type RuleEngine = "oxlint" | "eslint-template" | "fs" | "audit";

export interface RuleMeta {
  /** Rule name as it appears in findings, e.g. `no-moment` or (template rules) `vue/require-v-for-key`. */
  id: string;
  category: RuleCategory;
  /** Severity when the rule is enabled by default; `off` means registered but not enabled. */
  defaultSeverity: RuleSeverity;
  confidence: RuleConfidence;
  /**
   * Where the rule runs: `vue` rules run on every project, `nuxt` rules also run on Nuxt projects.
   * Nuxt-only rules list just `["nuxt"]`.
   */
  frameworks: RuleFramework[];
  /** CWE identifiers, e.g. `["CWE-79"]`. */
  cwe?: string[];
  /** OWASP Top 10 category, e.g. `A03:2021`. */
  owasp?: string;
  fixable: boolean;
  /**
   * Marks findings of this rule as critical (an exposed secret): at `error` severity they cap the
   * score at 30 (see utils/calculate-score.ts). Only meaningful for Security rules.
   */
  critical?: boolean;
  /** Vue Doctor version that introduced the rule. */
  since: string;
  /** Short, human-readable remediation shown next to a finding. */
  help: string;
  /** Instructions for an AI coding agent on how to fix a finding correctly. */
  agentGuidance: string;
  engine: RuleEngine;
}

/** What a rule file passes to `defineRule`; the engine is implied. */
type OxlintRuleMeta = Omit<RuleMeta, "engine">;

/** ESLint-compatible rule metadata, which is all oxlint's JS plugin loader reads. */
interface HostRuleMeta {
  type: "problem" | "suggestion";
  docs: { description: string };
  schema: [];
}

/** An oxlint/ESLint-compatible rule that also carries Vue Doctor's registry metadata. */
export interface DefinedRule extends Rule {
  meta: HostRuleMeta;
  /** Registry metadata. Kept apart from `meta` because hosts validate that object. */
  ruleMeta: RuleMeta;
}

interface RuleDefinition {
  meta: OxlintRuleMeta;
  create: (context: RuleContext) => RuleVisitors;
}

export const defineRule = ({ meta, create }: RuleDefinition): DefinedRule => ({
  meta: {
    type: meta.category === "Security" || meta.defaultSeverity === "error" ? "problem" : "suggestion",
    docs: { description: meta.help },
    schema: [],
  },
  create,
  ruleMeta: { ...meta, engine: "oxlint" },
});
