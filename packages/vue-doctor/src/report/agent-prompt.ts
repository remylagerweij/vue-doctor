import type { RuleMeta } from "../plugin/define-rule.js";
import { RULE_REGISTRY, getCanonicalRuleId } from "../plugin/registry.js";
import type { ReportFinding } from "./model.js";
import { maskSecrets } from "./mask-secrets.js";

/**
 * Prompts for AI coding agents, generated from rule metadata (`agentGuidance`) and the finding.
 * Plain text only (no Markdown), deterministic, and free of secret values: the prompt ends up in
 * PR comments, step summaries and JSON, where a leaked credential would be copied around.
 */

export type PromptFinding = Pick<ReportFinding, "ruleId" | "file" | "line" | "message" | "help" | "docsUrl"> &
  Partial<Pick<ReportFinding, "severity" | "cwe" | "endLine" | "codeFrame">>;

export interface PromptContext {
  /**
   * Project directory as passed to the verify command (`projects[].root`: relative to the scanned
   * directory, `.` for the project itself). Defaults to `.`.
   */
  projectRoot?: string;
}

export interface GroupPromptOptions extends PromptContext {
  /** Locations listed before the prompt says "and N more". */
  maxLocations?: number;
}

/** Default number of locations a group prompt lists. */
export const DEFAULT_GROUP_MAX_LOCATIONS = 10;

const PACKAGE_NAME = "@remylagerweij/vue-doctor";

const CONSTRAINTS =
  "Change only what is needed to fix it, keep the behaviour otherwise identical, do not suppress or disable the rule, do not add dependencies, and update a test only if one already covers this code.";

/** Dead-code findings come from knip, not from a registered rule, so they carry their own title and guidance. */
const KNIP_RULES: Readonly<Record<string, { title: string; guidance: string }>> = {
  "knip/files": {
    title: "Unused file",
    guidance:
      "Check that nothing uses the file, including dynamic imports, framework conventions (pages, layouts, plugins, middleware, server routes) and config files. If it is really unused, delete it. If it is used implicitly, leave it and declare it as an entry in the knip configuration instead of deleting it.",
  },
  "knip/exports": {
    title: "Unused export",
    guidance:
      "Remove the `export` keyword if the symbol is only used inside its own file, or delete the symbol when nothing uses it. Keep the export when it is part of the package's public API or used implicitly by the framework.",
  },
  "knip/types": {
    title: "Unused type",
    guidance:
      "Remove the `export` keyword if the type is only used inside its own file, or delete the type when nothing uses it. Keep the export when it is part of the package's public API.",
  },
  "knip/duplicates": {
    title: "Duplicate export",
    guidance:
      "Keep a single export for the symbol: remove the duplicate name or alias and update the importers to use the remaining one.",
  },
};

let metaByRuleId: Map<string, RuleMeta> | undefined;

/** Registry metadata for a canonical rule ID (`vue-doctor/<category>/<rule>` or `vue/<rule>`); `undefined` for other tools' rules. */
const findRuleMeta = (ruleId: string): RuleMeta | undefined => {
  metaByRuleId ??= new Map(RULE_REGISTRY.map((meta) => [getCanonicalRuleId(meta), meta]));
  return metaByRuleId.get(ruleId);
};

/** Security findings that expose a credential: their source lines and frames must never reach a prompt. */
const isSecretRule = (meta: RuleMeta | undefined): boolean => meta?.critical === true;

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const compareLocations = (left: PromptFinding, right: PromptFinding): number =>
  compareText(left.file, right.file) || left.line - right.line || compareText(left.message, right.message);

const formatLocation = (finding: Pick<PromptFinding, "file" | "line" | "endLine">): string => {
  if (finding.line <= 0) return finding.file;
  const range = finding.endLine !== undefined && finding.endLine > finding.line ? `-${finding.endLine}` : "";
  return `${finding.file}:${finding.line}${range}`;
};

/** Quotes a path for the verify command only when it needs it. */
const quoteArgument = (value: string): string =>
  /^[\w./@:+-]+$/.test(value) ? value : `"${value.replaceAll('"', '\\"')}"`;

/**
 * Command to confirm a fix. Uses only existing CLI options: `--diff` limits the scan to the files
 * the agent just changed (dead-code findings need the whole project, so they skip it).
 */
const verifyCommand = (ruleId: string, projectRoot: string): string => {
  const scope = ruleId.startsWith("knip/") ? "" : " --diff";
  return `npx ${PACKAGE_NAME} ${quoteArgument(projectRoot)}${scope} --format json`;
};

const describeRule = (
  ruleId: string,
  meta: RuleMeta | undefined,
  finding: PromptFinding,
): { title: string; guidance: string } => {
  const knip = KNIP_RULES[ruleId];
  if (knip) return knip;
  const guidance = meta?.agentGuidance ?? finding.help;
  return { title: meta?.category ?? "", guidance: guidance || "Fix the problem at the reported location." };
};

const ruleLine = (ruleId: string, title: string, finding: PromptFinding, meta: RuleMeta | undefined): string => {
  const details = [title, finding.severity ?? meta?.defaultSeverity, ...(finding.cwe ?? meta?.cwe ?? [])].filter(Boolean);
  return details.length > 0 ? `Rule: ${ruleId} (${details.join(", ")})` : `Rule: ${ruleId}`;
};

/**
 * The prompt an AI coding agent gets for one finding: rule, location, problem, guidance from the
 * rule's metadata, constraints and a command to verify the fix. Secret findings never include the
 * code frame, and anything token-like in the free text is masked.
 */
export const buildAgentPrompt = (finding: PromptFinding, context: PromptContext = {}): string => {
  const meta = findRuleMeta(finding.ruleId);
  const { title, guidance } = describeRule(finding.ruleId, meta, finding);
  const lines = [
    "You are fixing a Vue Doctor finding in this repository.",
    ruleLine(finding.ruleId, title, finding, meta),
    `File: ${formatLocation(finding)}`,
    `Problem: ${maskSecrets(finding.message)}`,
    `Guidance: ${maskSecrets(guidance)}`,
  ];
  if (finding.codeFrame && !isSecretRule(meta)) lines.push("Code:", maskSecrets(finding.codeFrame));
  lines.push(
    `Docs: ${finding.docsUrl}`,
    `Constraints: ${CONSTRAINTS}`,
    `Verify: run \`${verifyCommand(finding.ruleId, context.projectRoot ?? ".")}\` and confirm ${finding.ruleId} is no longer reported for this location.`,
  );
  return lines.join("\n");
};

/**
 * One prompt for several findings of the same rule: lists the locations (sorted, at most
 * `maxLocations`, then "and N more") so a single agent session can fix them together. Code frames
 * are left out; the agent opens the files itself.
 */
export const buildGroupPrompt = (findings: readonly PromptFinding[], options: GroupPromptOptions = {}): string => {
  if (findings.length === 0) throw new Error("buildGroupPrompt needs at least one finding");
  const [first] = findings;
  if (findings.some((finding) => finding.ruleId !== first.ruleId)) {
    throw new Error("buildGroupPrompt expects findings of a single rule");
  }
  const meta = findRuleMeta(first.ruleId);
  const { title, guidance } = describeRule(first.ruleId, meta, first);
  const sorted = [...findings].sort(compareLocations);
  const maxLocations = Math.max(1, options.maxLocations ?? DEFAULT_GROUP_MAX_LOCATIONS);
  const shown = sorted.slice(0, maxLocations);
  const hidden = sorted.length - shown.length;

  // Findings of one rule usually share a message; when they differ (a dead-code symbol), show each.
  const sharedMessage = sorted.every((finding) => finding.message === first.message);
  const fileCount = new Set(sorted.map((finding) => finding.file)).size;

  const lines = [
    "You are fixing Vue Doctor findings in this repository.",
    ruleLine(first.ruleId, title, first, meta),
    `Findings: ${sorted.length} in ${fileCount} ${fileCount === 1 ? "file" : "files"}`,
  ];
  if (sharedMessage) lines.push(`Problem: ${maskSecrets(first.message)}`);
  lines.push("Locations:");
  for (const finding of shown) {
    lines.push(`- ${formatLocation(finding)}${sharedMessage ? "" : `: ${maskSecrets(finding.message)}`}`);
  }
  if (hidden > 0) lines.push(`- and ${hidden} more (the verify command lists them all)`);
  lines.push(
    `Guidance: ${maskSecrets(guidance)}`,
    `Docs: ${first.docsUrl}`,
    `Constraints: ${CONSTRAINTS}`,
    `Verify: run \`${verifyCommand(first.ruleId, options.projectRoot ?? ".")}\` and confirm ${first.ruleId} is no longer reported.`,
  );
  return lines.join("\n");
};
