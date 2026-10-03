import type { PresetName, RuleEntry, RuleSeverity, VueDoctorConfig } from "../config/schema.js";
import type { Diagnostic } from "../types.js";
import { resolveRuleKey, ruleIdOf } from "../plugin/rule-ids.js";
import { compileGlobPattern } from "./match-glob-pattern.js";

/**
 * Whether a configured rule key refers to this diagnostic. Canonical keys are
 * `vue-doctor/<category>/<rule>`, `vue/<rule>` and `knip/<type>`; `<prefix>/*` selects a whole
 * group (`vue-doctor/security/*`). The 1.x spellings `no-moment` and `vue-doctor/no-moment` are
 * deprecated aliases for the canonical ID (see `resolveRuleKey`).
 */
export const matchesRuleKey = (key: string, diagnostic: Diagnostic): boolean =>
  resolveRuleKey(key).matches(ruleIdOf(diagnostic));

const toDiagnosticSeverity = (severity: RuleSeverity): Diagnostic["severity"] | null => {
  if (severity === "off") return null;
  return severity === "error" ? "error" : "warning";
};

const severityOf = (entry: RuleEntry): RuleSeverity => (Array.isArray(entry) ? entry[0] : entry);

const applyPreset = (diagnostic: Diagnostic, preset: PresetName): Diagnostic | null => {
  switch (preset) {
    case "vue-doctor/recommended":
      return diagnostic;
    case "vue-doctor/strict":
      return { ...diagnostic, severity: "error" };
    case "vue-doctor/security":
      return diagnostic.category === "Security" || diagnostic.category === "Supply Chain" ? diagnostic : null;
  }
};

/**
 * Applies the user's config to the combined findings: presets (`extends`, in order), then per-rule
 * severities (`rules`, last matching key wins), then `ignore`.
 */
export const filterDiagnostics = (
  diagnostics: Diagnostic[],
  config: VueDoctorConfig | null,
): Diagnostic[] => {
  if (!config) return diagnostics;

  const presets = config.extends ?? [];
  // Resolve rule keys and compile globs once, not once per diagnostic.
  const ruleEntries = Object.entries(config.rules ?? {}).map(([key, entry]) => ({
    matches: resolveRuleKey(key).matches,
    severity: toDiagnosticSeverity(severityOf(entry)),
  }));
  const ignoredRuleMatchers = (config.ignore?.rules ?? []).map((key) => resolveRuleKey(key).matches);
  const ignoredFileMatchers = (config.ignore?.files ?? []).map(compileGlobPattern);

  return diagnostics.flatMap((original) => {
    let diagnostic: Diagnostic | null = original;
    for (const preset of presets) {
      diagnostic = applyPreset(diagnostic, preset);
      if (!diagnostic) return [];
    }

    // Last matching key wins, so a specific key can re-enable a rule an earlier key turned off.
    const ruleId = ruleIdOf(diagnostic);
    let severity: Diagnostic["severity"] | null = diagnostic.severity;
    for (const entry of ruleEntries) {
      if (entry.matches(ruleId)) severity = entry.severity;
    }
    if (!severity) return [];

    if (ignoredRuleMatchers.some((matches) => matches(ruleId))) return [];
    if (ignoredFileMatchers.some((matches) => matches(diagnostic.filePath))) return [];
    return [{ ...diagnostic, severity }];
  });
};
