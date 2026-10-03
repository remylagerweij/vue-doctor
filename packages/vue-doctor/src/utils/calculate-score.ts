import {
  CRITICAL_SECRET_SCORE_CAP,
  ERROR_RULE_PENALTY,
  PERFECT_SCORE,
  SCORE_GOOD_THRESHOLD,
  SCORE_OK_THRESHOLD,
  SCORE_VERSION,
  SECURITY_ERROR_SCORE_CAP,
  WARNING_RULE_PENALTY,
} from "../constants.js";
import { getRuleMeta } from "../plugin/registry.js";
import { ruleIdOf } from "../plugin/rule-ids.js";
import type { CategoryScore, Diagnostic, ScoreCap, ScoreImpact, ScoreResult } from "../types.js";

/**
 * Score formula, version 2 (documented in docs/guide/scoring.md):
 *
 *   base    = 100 - 1.5 * (unique rules with an error) - 0.75 * (unique rules with a warning), floored at 0
 *   overall = min(base, cap), where the cap is 30 while a critical secret (error) is present,
 *             else 50 while a high-confidence security error is present
 *
 * A rule counts once however many findings it has. Category scores use the base formula on the
 * findings of one category and are never capped.
 */

const getScoreLabel = (score: number): string => {
  if (score >= PERFECT_SCORE) return "Perfect";
  if (score >= SCORE_GOOD_THRESHOLD) return "Great";
  if (score >= SCORE_OK_THRESHOLD) return "Needs work";
  return "Critical";
};

/** Penalty-model score of a set of findings (no caps). */
const baseScore = (diagnostics: Diagnostic[]): number => {
  const errorRules = new Set<string>();
  const warningRules = new Set<string>();
  for (const diagnostic of diagnostics) {
    (diagnostic.severity === "error" ? errorRules : warningRules).add(ruleIdOf(diagnostic));
  }
  const penalty = errorRules.size * ERROR_RULE_PENALTY + warningRules.size * WARNING_RULE_PENALTY;
  return Math.max(0, Math.round(PERFECT_SCORE - penalty));
};

/**
 * The strictest cap the findings trigger, if any. Driven by rule metadata: only an `error` finding
 * of a Security rule caps the score. The rule's `critical` flag (an exposed secret) caps at 30;
 * otherwise high confidence caps at 50.
 */
const findCap = (diagnostics: Diagnostic[]): ScoreCap | null => {
  let cap: ScoreCap | null = null;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "error") continue;
    const meta = getRuleMeta(diagnostic.plugin, diagnostic.rule);
    if (meta?.category !== "Security") continue;
    if (meta.critical) {
      return { value: CRITICAL_SECRET_SCORE_CAP, reason: "critical-secret", ruleId: ruleIdOf(diagnostic) };
    }
    if (meta.confidence === "high") {
      cap ??= { value: SECURITY_ERROR_SCORE_CAP, reason: "security-error", ruleId: ruleIdOf(diagnostic) };
    }
  }
  return cap;
};

const overallScore = (diagnostics: Diagnostic[]): number => {
  const cap = findCap(diagnostics);
  const base = baseScore(diagnostics);
  return cap ? Math.min(base, cap.value) : base;
};

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const groupBy = (diagnostics: Diagnostic[], keyOf: (diagnostic: Diagnostic) => string): Map<string, Diagnostic[]> => {
  const groups = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const key = keyOf(diagnostic);
    const group = groups.get(key) ?? [];
    group.push(diagnostic);
    groups.set(key, group);
  }
  return groups;
};

/** Sub-scores of the categories that have findings, worst first. */
const scoreCategories = (diagnostics: Diagnostic[]): CategoryScore[] =>
  [...groupBy(diagnostics, (diagnostic) => diagnostic.category)]
    .map(([category, group]) => {
      const score = baseScore(group);
      return {
        category,
        score,
        label: getScoreLabel(score),
        errors: group.filter((diagnostic) => diagnostic.severity === "error").length,
        warnings: group.filter((diagnostic) => diagnostic.severity === "warning").length,
      };
    })
    .sort((left, right) => left.score - right.score || compareText(left.category, right.category));

/** Exact overall-score gain of fixing every finding of each rule; rules that would not change the score are omitted. */
const scoreImpact = (diagnostics: Diagnostic[], currentScore: number): ScoreImpact[] => {
  const impact: ScoreImpact[] = [];
  for (const ruleId of groupBy(diagnostics, ruleIdOf).keys()) {
    const remaining = diagnostics.filter((diagnostic) => ruleIdOf(diagnostic) !== ruleId);
    const gain = overallScore(remaining) - currentScore;
    if (gain > 0) impact.push({ ruleId, gain });
  }
  return impact.sort((left, right) => right.gain - left.gain || compareText(left.ruleId, right.ruleId));
};

export const calculateScore = (diagnostics: Diagnostic[]): ScoreResult => {
  const rawScore = baseScore(diagnostics);
  const triggeredCap = findCap(diagnostics);
  // A cap only counts when it actually lowers the score.
  const cap = triggeredCap && triggeredCap.value < rawScore ? triggeredCap : null;
  const score = cap ? cap.value : rawScore;

  return {
    version: SCORE_VERSION,
    score,
    label: getScoreLabel(score),
    rawScore,
    cap,
    categories: scoreCategories(diagnostics),
    impact: scoreImpact(diagnostics, score),
  };
};
