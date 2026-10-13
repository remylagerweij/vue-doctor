import type { DefinedRule } from "../plugin/define-rule.js";
import { OXLINT_RULES, getCanonicalRuleId, type RuleOptionsById } from "../plugin/registry.js";
import { resolveRuleKey } from "../plugin/rule-ids.js";
import type { RuleEntry, VueDoctorConfig } from "./schema.js";

type OptionsObject = Readonly<Record<string, unknown>>;

/** `[severity, { ... }]` entries with a non-empty options object. */
export const optionEntries = (config: VueDoctorConfig | null | undefined): [string, OptionsObject][] =>
  Object.entries(config?.rules ?? {}).flatMap(([key, entry]: [string, RuleEntry]) =>
    Array.isArray(entry) && entry.length === 2 && Object.keys(entry[1]).length > 0 ? [[key, entry[1]]] : [],
  );

/** Own lint rules a single (non-group) key selects. */
export const rulesForKey = (key: string): DefinedRule[] => {
  if (key.trim().endsWith("/*")) return [];
  const { matches } = resolveRuleKey(key);
  return OXLINT_RULES.filter((rule) => matches(getCanonicalRuleId(rule.ruleMeta)));
};

/**
 * Options from config `rules` entries written as `[severity, { ... }]`, keyed by the rule's flat
 * name. Options for group keys and for rules that take none are dropped with a warning.
 */
export const resolveConfiguredRuleOptions = (
  config: VueDoctorConfig | null | undefined,
  warn: (message: string) => void = () => {},
): Record<string, Record<string, unknown>> => {
  const resolved: Record<string, Record<string, unknown>> = {};
  for (const [key, options] of optionEntries(config)) {
    const rules = rulesForKey(key);
    const accepting = rules.filter((rule) => rule.ruleMeta.options);
    if (accepting.length === 0) {
      warn(`Options for "${key.trim()}" are ignored: only single rules that document options accept them.`);
      continue;
    }
    for (const { ruleMeta } of accepting) {
      resolved[ruleMeta.id] = { ...resolved[ruleMeta.id], ...options };
    }
  }
  return resolved;
};

/** Combines inferred and configured options: configured scalars win, string lists are joined. */
export const mergeRuleOptions = (inferred: RuleOptionsById, configured: RuleOptionsById): RuleOptionsById => {
  const merged: Record<string, Record<string, unknown>> = {};
  for (const id of new Set([...Object.keys(inferred), ...Object.keys(configured)])) {
    const base: Record<string, unknown> = { ...inferred[id] };
    for (const [name, value] of Object.entries(configured[id] ?? {})) {
      const previous = base[name];
      base[name] = Array.isArray(previous) && Array.isArray(value) ? [...new Set([...previous, ...value])] : value;
    }
    merged[id] = base;
  }
  return merged;
};
