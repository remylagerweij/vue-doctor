import { AUDIT_RULES, FS_RULES, OXLINT_RULES, getCanonicalRuleId, type OptInRules } from "../plugin/registry.js";
import { resolveRuleKey } from "../plugin/rule-ids.js";
import type { RuleEntry, VueDoctorConfig } from "./schema.js";

const severityOf = (entry: RuleEntry): string => (Array.isArray(entry) ? entry[0] : entry);

/**
 * Own rules that ship off by default (opt-in preview rules, e.g. the 2.5 accessibility pack) and that
 * the config's `rules` turns on, as flat rule names. A rule is on when the last `rules` key that
 * matches it (its canonical ID, or a group such as `vue-doctor/accessibility/*`) has a severity
 * other than `"off"`, and no `ignore.rules` key matches it. Presets (`extends`) never enable an
 * opt-in rule: opting in is always explicit.
 */
export const resolveOptInRules = (config: VueDoctorConfig | null | undefined): OptInRules => {
  const enabled = new Set<string>();
  const entries = Object.entries(config?.rules ?? {}).map(([key, entry]) => ({
    matches: resolveRuleKey(key).matches,
    on: severityOf(entry) !== "off",
  }));
  if (entries.length === 0) return enabled;
  const ignored = (config?.ignore?.rules ?? []).map((key) => resolveRuleKey(key).matches);

  for (const { ruleMeta: meta } of [...OXLINT_RULES, ...FS_RULES, ...AUDIT_RULES]) {
    if (meta.defaultSeverity !== "off") continue;
    const ruleId = getCanonicalRuleId(meta);
    let on = false;
    for (const entry of entries) if (entry.matches(ruleId)) on = entry.on;
    if (on && !ignored.some((matches) => matches(ruleId))) enabled.add(meta.id);
  }
  return enabled;
};
