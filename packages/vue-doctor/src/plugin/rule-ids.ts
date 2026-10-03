import type { Diagnostic } from "../types.js";
import { PLUGIN_NAME, RULE_REGISTRY, getCanonicalRuleId, getRuleMeta } from "./registry.js";

/**
 * Rule ID resolution. The canonical IDs are `vue-doctor/<category>/<rule>` (own rules),
 * `vue/<rule>` (eslint-plugin-vue template rules) and `knip/<type>` (dead code). The 1.x spellings
 * (`no-eval`, `vue-doctor/no-eval`, bare `no-v-html`) stay accepted as deprecated aliases, and
 * `<prefix>/*` selects every rule below a prefix (`vue-doctor/security/*`, `vue/*`).
 */

const KNIP_PREFIX = "knip/";

/** Canonical ID of the rule a finding came from. */
export const ruleIdOf = (diagnostic: Pick<Diagnostic, "plugin" | "rule">): string => {
  const { plugin, rule } = diagnostic;
  if (plugin === PLUGIN_NAME && !rule.includes("/")) {
    // Flat name, as oxlint reports it (or as cached by an older run): resolve through the registry.
    const meta = getRuleMeta(plugin, rule);
    if (meta) return getCanonicalRuleId(meta);
  }
  // Template rules carry their namespace (`vue/<rule>`) in `rule`; own rules and knip carry it in `plugin`.
  if (rule.startsWith("vue/") || (plugin !== PLUGIN_NAME && rule.includes("/"))) return rule;
  return `${plugin}/${rule}`;
};

const CANONICAL_IDS: ReadonlySet<string> = new Set(RULE_REGISTRY.map((meta) => getCanonicalRuleId(meta)));

/**
 * Rules that were removed, split or merged into other rules in 2.0, by every spelling users may have
 * written. They resolve like a 1.x alias (deprecated, with the replacements) so existing config,
 * baselines and suppression comments keep working.
 */
const REMOVED_RULE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // The placeholder own rule and eslint-plugin-vue's `vue/no-v-html` are replaced by one rule that
  // covers templates and scripts and skips sanitised values.
  "no-v-html": ["vue-doctor/security/no-unsafe-html-sink"],
  "vue-doctor/no-v-html": ["vue-doctor/security/no-unsafe-html-sink"],
  "vue-doctor/security/no-v-html": ["vue-doctor/security/no-unsafe-html-sink"],
  "vue/no-v-html": ["vue-doctor/security/no-unsafe-html-sink"],
  // Split by confidence: provider-format keys (error, critical) and secret-named literals (warning).
  ...Object.fromEntries(
    ["no-secrets-in-client-code", "vue-doctor/no-secrets-in-client-code", "vue-doctor/security/no-secrets-in-client-code"].map(
      (alias) => [alias, ["vue-doctor/security/no-hardcoded-secret", "vue-doctor/security/no-secret-named-literal"]],
    ),
  ),
};

/** Lower-cased legacy spelling to the canonical IDs it stands for (a bare name can mean two rules). */
const LEGACY_ALIASES: ReadonlyMap<string, readonly string[]> = (() => {
  const aliases = new Map<string, string[]>();
  const add = (alias: string, canonical: string): void => {
    const list = aliases.get(alias.toLowerCase()) ?? [];
    if (!list.includes(canonical)) list.push(canonical);
    aliases.set(alias.toLowerCase(), list);
  };
  for (const meta of RULE_REGISTRY) {
    const canonical = getCanonicalRuleId(meta);
    if (meta.engine !== "eslint-template") {
      add(meta.id, canonical);
      add(`${PLUGIN_NAME}/${meta.id}`, canonical);
    } else {
      add(meta.id.replace(/^vue\//, ""), canonical);
    }
  }
  for (const [alias, replacements] of Object.entries(REMOVED_RULE_ALIASES)) {
    for (const replacement of replacements) if (CANONICAL_IDS.has(replacement)) add(alias, replacement);
  }
  return aliases;
})();

/** How a user-written rule key (config, `ignore.rules`, suppression comment) maps to rules. */
export interface RuleKeyResolution {
  /** Whether a finding with this canonical ID (see `ruleIdOf`) is selected by the key. */
  matches: (ruleId: string) => boolean;
  /** `true` when the key is a 1.x spelling. */
  deprecated: boolean;
  /** Canonical replacement(s) for a deprecated key. */
  replacements: readonly string[];
  /** `false` when the key selects no Vue Doctor, template or dead-code rule. */
  known: boolean;
}

const resolutionCache = new Map<string, RuleKeyResolution>();

const resolve = (normalized: string): RuleKeyResolution => {
  if (normalized.endsWith("/*")) {
    const prefix = normalized.slice(0, -1);
    const known = prefix === KNIP_PREFIX || [...CANONICAL_IDS].some((id) => id.toLowerCase().startsWith(prefix));
    return { matches: (ruleId) => ruleId.toLowerCase().startsWith(prefix), deprecated: false, replacements: [], known };
  }

  const canonical = [...CANONICAL_IDS].find((id) => id.toLowerCase() === normalized);
  if (canonical) {
    return { matches: (ruleId) => ruleId === canonical, deprecated: false, replacements: [], known: true };
  }

  const legacy = LEGACY_ALIASES.get(normalized);
  if (legacy) {
    return { matches: (ruleId) => legacy.includes(ruleId), deprecated: true, replacements: legacy, known: true };
  }

  // Dead-code findings (`knip/<type>`) are other tools' IDs and not in the registry.
  return {
    matches: (ruleId) => ruleId.toLowerCase() === normalized,
    deprecated: false,
    replacements: [],
    known: normalized.startsWith(KNIP_PREFIX),
  };
};

export const resolveRuleKey = (key: string): RuleKeyResolution => {
  const normalized = key.trim().toLowerCase();
  let resolution = resolutionCache.get(normalized);
  if (!resolution) {
    resolution = resolve(normalized);
    resolutionCache.set(normalized, resolution);
  }
  return resolution;
};

const formatReplacements = (replacements: readonly string[]): string =>
  replacements.map((id) => `"${id}"`).join(" or ");

/**
 * Reports each distinct problematic rule ID once per run: 1.x spellings (deprecated, with the
 * replacement) and, for config keys, IDs that match no rule at all.
 */
export const createRuleIdReporter = (warn: (message: string) => void) => {
  const reported = new Set<string>();
  return {
    /** `source` names where an unknown ID was written, e.g. `config "rules"`; omit it to skip unknown-ID warnings. */
    check: (key: string, source?: string): void => {
      const normalized = key.trim().toLowerCase();
      if (reported.has(normalized)) return;
      const resolution = resolveRuleKey(key);
      if (resolution.deprecated) {
        reported.add(normalized);
        warn(`Rule ID "${key.trim()}" is deprecated; use ${formatReplacements(resolution.replacements)}.`);
      } else if (!resolution.known && source) {
        reported.add(normalized);
        warn(`Unknown rule ID "${key.trim()}" in ${source}; it does not match any Vue Doctor rule.`);
      }
    },
  };
};

export type RuleIdReporter = ReturnType<typeof createRuleIdReporter>;
