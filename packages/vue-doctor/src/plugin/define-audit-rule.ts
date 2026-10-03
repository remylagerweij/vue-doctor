import type { RuleMeta } from "./define-rule.js";

/**
 * Audit rules (`engine: "audit"`): findings that come from an opt-in network lookup rather than
 * from the project's source (the OSV dependency audit, see utils/run-audit.ts). They are defined
 * like every other rule (`src/plugin/rules/<category>/<id>.ts`) so that metadata, docs, config
 * keys, severities and the report treat them alike, but they carry no `create` or `check`: the
 * "audit" analyzer produces their findings and only runs when the user turns it on.
 */

/** What a rule file passes to `defineAuditRule`; the engine is implied. */
type AuditRuleMeta = Omit<RuleMeta, "engine">;

export interface DefinedAuditRule {
  /** Registry metadata, same shape as for the other engines. */
  ruleMeta: RuleMeta;
}

export const defineAuditRule = ({ meta }: { meta: AuditRuleMeta }): DefinedAuditRule => ({
  ruleMeta: { ...meta, engine: "audit" },
});

export const isAuditRule = (rule: { ruleMeta: RuleMeta }): rule is DefinedAuditRule =>
  rule.ruleMeta.engine === "audit";
