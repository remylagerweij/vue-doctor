import { DOCS_BASE_URL } from "../constants.js";
import type { Report, ReportFinding, ReportProject } from "./model.js";
import {
  escapeMarkdown,
  markdownCode,
  markdownFence,
  sanitizeMarkerId,
  toTrustedUrl,
} from "./markdown-escape.js";

/**
 * Markdown output for the sticky PR comment, `$GITHUB_STEP_SUMMARY`, finding comments and
 * `--format markdown`, built from the `report@2` model.
 *
 * Design decisions:
 * - Every string that comes from the scanned project goes through `markdown-escape.ts`; links are
 *   only built from `docsUrl`s on the docs origin, never from user text.
 * - Security findings never print source: no code frame, and the code frame is cut out of the AI
 *   prompt too (a matched secret would otherwise end up in a public PR comment).
 * - The output is bounded by GitHub's comment limit. Findings are selected (errors first, then
 *   report order) and rendered in whole blocks, so the cut is deterministic and never leaves an
 *   open `<details>` or code fence; a notice says how many findings are not shown.
 */

/** GitHub rejects comments and step summaries longer than this many characters. */
export const GITHUB_COMMENT_LIMIT = 65_536;

export interface MarkdownOptions {
  /** Maximum length of the document; defaults to {@link GITHUB_COMMENT_LIMIT}. */
  maxLength?: number;
  /** Maximum number of findings listed over all projects. Default 50. */
  maxFindings?: number;
  /** Maximum number of findings listed per rule (and project). Default 10. */
  maxFindingsPerRule?: number;
  /** Starts the document with the `<!-- vue-doctor:summary -->` marker that a sticky comment is looked up by. */
  stickyMarker?: boolean;
  /** Wraps the findings list in a collapsed `<details>` block. */
  collapseFindings?: boolean;
  /** Lists only findings that are new relative to the baseline or base branch (when the report has statuses). */
  newOnly?: boolean;
  /** Includes the AI fix prompt of every listed finding in a `<details>` block. Default false: it is large. */
  agentPrompts?: boolean;
  /** Overrides the trusted documentation origin (tests). */
  docsBaseUrl?: string;
}

export interface MarkdownFindingOptions {
  /** Starts with `<!-- vue-doctor:finding:<fingerprint> -->`, the marker comments are matched by on reruns. */
  marker?: boolean;
  /** Shows the code frame (never for Security findings). Default true. */
  codeFrame?: boolean;
  /** Shows the AI fix prompt when the finding has one, in a collapsed block. Default true. */
  agentPrompt?: boolean;
  docsBaseUrl?: string;
}

export const SUMMARY_MARKER = "<!-- vue-doctor:summary -->";

const DEFAULT_MAX_FINDINGS = 50;
const DEFAULT_MAX_FINDINGS_PER_RULE = 10;
/** Room kept for the "not shown" notice and closing tags when the findings list is cut. */
const RESERVED_FOOTER_LENGTH = 400;
const SEVERITY_ICON: Record<ReportFinding["severity"], string> = { error: "🔴", warning: "⚠️" };

const scoreIcon = (score: number): string => (score >= 90 ? "🟢" : score >= 70 ? "🟡" : score >= 50 ? "🟠" : "🔴");
const plural = (count: number, singular: string): string => `${count} ${singular}${count === 1 ? "" : "s"}`;

const CAP_REASONS: Record<NonNullable<ReportProject["score"]["cap"]>["reason"], string> = {
  "security-error": "high-confidence security error",
  "critical-secret": "critical secret",
};

const trustedLink = (label: string, url: string, docsBaseUrl: string): string => {
  const href = toTrustedUrl(url, docsBaseUrl);
  return href ? `[${label}](${href})` : label;
};

const ruleLabel = (ruleId: string, docsUrl: string, docsBaseUrl: string): string =>
  trustedLink(markdownCode(ruleId), docsUrl, docsBaseUrl);

const locationOf = (finding: ReportFinding): string =>
  markdownCode(finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file);

/** Cuts at a line break (or code point boundary) so a block is never split in the middle of a line pair. */
const cutTo = (text: string, length: number): string => {
  if (text.length <= length) return text;
  const lineBreak = text.lastIndexOf("\n", length);
  if (lineBreak > 0) return text.slice(0, lineBreak);
  const end = /[\ud800-\udbff]/.test(text[length - 1] ?? "") ? length - 1 : length;
  return text.slice(0, end);
};

const renderCategoryTable = (project: ReportProject): string[] => {
  if (project.score.categories.length === 0) return [];
  return [
    "| Category | Score | Errors | Warnings |",
    "| --- | ---: | ---: | ---: |",
    ...project.score.categories.map(
      (entry) =>
        `| ${escapeMarkdown(entry.category)} | ${scoreIcon(entry.score)} ${entry.score} | ${entry.errors} | ${entry.warnings} |`,
    ),
    "",
  ];
};

const renderProjectSummary = (project: ReportProject, heading: string | null, docsBaseUrl: string): string[] => {
  const { score } = project;
  const lines: string[] = [];
  const scoreText = `${scoreIcon(score.value)} **${score.value}/100** (${escapeMarkdown(score.label)})`;
  if (heading === null) lines.push(`## 🩺 Vue Doctor: ${scoreText}`, "");
  else lines.push(`### ${escapeMarkdown(heading)}: ${scoreText}`, "");

  if (score.cap) {
    lines.push(
      `> **Score capped at ${score.cap.value}** (${score.rawScore} before the cap) because of a ${CAP_REASONS[score.cap.reason]} in ${markdownCode(score.cap.ruleId)}.`,
      "",
    );
  }

  const counts = [plural(project.summary.errors, "error"), plural(project.summary.warnings, "warning")];
  if (project.summary.suppressed > 0) counts.push(`${project.summary.suppressed} suppressed`);
  lines.push(counts.join(" · "), "");

  if (project.baseline) {
    const fixed = project.baseline.fixed === null ? "" : `, ${project.baseline.fixed} fixed`;
    lines.push(`Baseline ${markdownCode(project.baseline.path)}: ${project.baseline.new} new${fixed}, ${project.baseline.matched} known.`, "");
  }

  for (const entry of project.skipped) {
    lines.push(
      "> [!WARNING]",
      `> ${escapeMarkdown(entry.tool)} did not run: ${escapeMarkdown(entry.reason)}. The score is incomplete.`,
      "",
    );
  }

  if (project.findings.length === 0) {
    lines.push("✅ **No issues found.**", "");
    return lines;
  }

  lines.push(...renderCategoryTable(project));

  if (score.impact.length > 0) {
    const docsByRule = new Map(project.findings.map((finding) => [finding.ruleId, finding.docsUrl]));
    lines.push("**Biggest improvements**", "");
    for (const { ruleId, gain } of score.impact.slice(0, 3)) {
      lines.push(`- Fixing ${ruleLabel(ruleId, docsByRule.get(ruleId) ?? "", docsBaseUrl)} gains **+${gain}**`);
    }
    lines.push("");
  }
  return lines;
};

/** Score, category sub-scores, impact hints, counts, baseline and skipped-analyzer warnings; per project for monorepos. */
export const renderMarkdownSummary = (report: Report, options: MarkdownOptions = {}): string => {
  const docsBaseUrl = options.docsBaseUrl ?? DOCS_BASE_URL;
  const lines: string[] = [];
  if (options.stickyMarker) lines.push(SUMMARY_MARKER, "");
  if (report.projects.length === 1) {
    lines.push(...renderProjectSummary(report.projects[0], null, docsBaseUrl));
  } else {
    lines.push(
      `## 🩺 Vue Doctor: ${plural(report.summary.projects, "project")}`,
      "",
      `${plural(report.summary.errors, "error")} · ${plural(report.summary.warnings, "warning")}`,
      "",
    );
    for (const project of report.projects) lines.push(...renderProjectSummary(project, project.name, docsBaseUrl));
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
};

/** The agent prompt of a finding without any source text: a Security finding's code frame is cut out. */
export const promptOf = (finding: ReportFinding): string => {
  if (finding.category !== "Security" || !finding.codeFrame) return finding.agentPrompt;
  return finding.agentPrompt.replaceAll(finding.codeFrame, "[code omitted for security findings]");
};

const renderPromptBlock = (finding: ReportFinding): string[] => [
  "<details>",
  "<summary>🤖 Fix with an AI agent</summary>",
  "",
  markdownFence(promptOf(finding), "text"),
  "",
  "</details>",
];

/**
 * One finding as a self-contained block (a finding comment): rule, location, message, help, docs
 * link, an optional code frame and a collapsed AI prompt.
 */
export const renderMarkdownFinding = (finding: ReportFinding, options: MarkdownFindingOptions = {}): string => {
  const docsBaseUrl = options.docsBaseUrl ?? DOCS_BASE_URL;
  const lines: string[] = [];
  if (options.marker && finding.fingerprint) lines.push(`<!-- vue-doctor:finding:${sanitizeMarkerId(finding.fingerprint)} -->`);
  const facts = [finding.severity, `confidence ${finding.confidence}`, ...(finding.cwe ?? []).map((cwe) => escapeMarkdown(cwe))];
  lines.push(`**${SEVERITY_ICON[finding.severity]} ${ruleLabel(finding.ruleId, finding.docsUrl, docsBaseUrl)}** · ${facts.join(" · ")}`, "");
  lines.push(`${locationOf(finding)}: ${escapeMarkdown(finding.message)}`, "");
  if (finding.help) lines.push(`**Help:** ${escapeMarkdown(finding.help)}`, "");
  const docs = toTrustedUrl(finding.docsUrl, docsBaseUrl);
  if (docs) lines.push(`[Documentation](${docs})`, "");
  if ((options.codeFrame ?? true) && finding.codeFrame && finding.category !== "Security") {
    lines.push(markdownFence(finding.codeFrame, "text"), "");
  }
  if ((options.agentPrompt ?? true) && finding.agentPrompt) lines.push(...renderPromptBlock(finding), "");
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
};

interface Candidate {
  project: ReportProject;
  finding: ReportFinding;
  index: number;
}

interface RuleGroup {
  key: string;
  project: ReportProject;
  ruleId: string;
  hasError: boolean;
  total: number;
  entries: Candidate[];
}

const isVisible = (finding: ReportFinding, newOnly: boolean): boolean =>
  !newOnly || finding.status === undefined || finding.status === "new";

/**
 * Picks the findings to list: errors first, then report order, at most `maxFindings` overall and
 * `maxPerRule` per project and rule. Grouped by rule, the groups with errors and then the most
 * findings first; entries keep report order.
 */
const selectGroups = (report: Report, options: Required<Pick<MarkdownOptions, "maxFindings" | "maxFindingsPerRule" | "newOnly">>) => {
  const candidates: Candidate[] = report.projects.flatMap((project, projectIndex) =>
    project.findings
      .map((finding, index) => ({ project, finding, index: projectIndex * 1e9 + index }))
      .filter(({ finding }) => isVisible(finding, options.newOnly)),
  );
  const ranked = [...candidates].sort(
    (left, right) =>
      Number(right.finding.severity === "error") - Number(left.finding.severity === "error") || left.index - right.index,
  );

  const groups = new Map<string, RuleGroup>();
  const perRule = new Map<string, number>();
  for (const candidate of candidates) {
    const key = `${candidate.project.root}\0${candidate.finding.ruleId}`;
    const group = groups.get(key) ?? {
      key,
      project: candidate.project,
      ruleId: candidate.finding.ruleId,
      hasError: false,
      total: 0,
      entries: [],
    };
    group.total += 1;
    group.hasError ||= candidate.finding.severity === "error";
    groups.set(key, group);
  }

  let selected = 0;
  for (const candidate of ranked) {
    if (selected >= options.maxFindings) break;
    const key = `${candidate.project.root}\0${candidate.finding.ruleId}`;
    const used = perRule.get(key) ?? 0;
    if (used >= options.maxFindingsPerRule) continue;
    perRule.set(key, used + 1);
    groups.get(key)?.entries.push(candidate);
    selected += 1;
  }

  const projectOrder = new Map(report.projects.map((project, order) => [project.root, order]));
  const ordered = [...groups.values()]
    .filter((group) => group.entries.length > 0)
    .map((group) => ({ ...group, entries: group.entries.sort((left, right) => left.index - right.index) }))
    .sort(
      (left, right) =>
        (projectOrder.get(left.project.root) ?? 0) - (projectOrder.get(right.project.root) ?? 0) ||
        Number(right.hasError) - Number(left.hasError) ||
        right.total - left.total ||
        left.ruleId.localeCompare(right.ruleId),
    );
  return { groups: ordered, total: candidates.length };
};

const renderGroupHeading = (group: RuleGroup, multiProject: boolean, docsBaseUrl: string): string[] => {
  const first = group.entries[0].finding;
  const lines = [
    `${multiProject ? "####" : "###"} ${SEVERITY_ICON[group.hasError ? "error" : "warning"]} ${ruleLabel(group.ruleId, first.docsUrl, docsBaseUrl)} (${group.total})`,
    "",
  ];
  if (first.help) lines.push(escapeMarkdown(first.help), "");
  return lines;
};

/** A fenced block inside a list item needs its continuation lines indented; blank lines stay empty. */
const renderIndentedPrompt = (finding: ReportFinding): string[] =>
  renderPromptBlock(finding).flatMap((block) => block.split("\n").map((line) => (line === "" ? "" : `  ${line}`)));

const renderEntry = (entry: Candidate, agentPrompts: boolean): string[] => {
  const { finding } = entry;
  const status = finding.status === "new" ? " **new**" : "";
  const lines = [`- ${locationOf(finding)}${status}: ${escapeMarkdown(finding.message)}`];
  if (agentPrompts && finding.agentPrompt) lines.push("", ...renderIndentedPrompt(finding), "");
  return lines;
};

/**
 * The findings list, grouped by rule (per project in a monorepo). `budget` bounds its length; the
 * list is cut between findings and ends with a notice that counts what is not shown.
 */
export const renderMarkdownFindings = (report: Report, options: MarkdownOptions = {}, budget = Number.POSITIVE_INFINITY): string => {
  const docsBaseUrl = options.docsBaseUrl ?? DOCS_BASE_URL;
  const { groups, total } = selectGroups(report, {
    maxFindings: options.maxFindings ?? DEFAULT_MAX_FINDINGS,
    maxFindingsPerRule: options.maxFindingsPerRule ?? DEFAULT_MAX_FINDINGS_PER_RULE,
    newOnly: options.newOnly ?? false,
  });
  if (total === 0) return "";
  const multiProject = report.projects.length > 1;
  const collapse = options.collapseFindings ?? false;
  const summaryLine = `<summary>📋 ${plural(total, "finding")}</summary>`;
  const opening = collapse ? ["<details>", summaryLine, ""] : ["---", ""];
  const closing = collapse ? "</details>" : "";

  const available = budget - RESERVED_FOOTER_LENGTH - opening.join("\n").length;
  let used = 0;
  let shown = 0;
  let lastProject: ReportProject | null = null;
  const body: string[] = [];

  groupLoop: for (const group of groups) {
    const projectHeading =
      multiProject && group.project !== lastProject ? [`### ${escapeMarkdown(group.project.name)}`, ""] : [];
    let chunk = [...projectHeading, ...renderGroupHeading(group, multiProject, docsBaseUrl)];
    let chunkOpen = false;
    for (const entry of group.entries) {
      const entryLines = renderEntry(entry, options.agentPrompts ?? false);
      const addition = `${[...(chunkOpen ? [] : chunk), ...entryLines].join("\n")}\n`;
      if (used + addition.length > available) break groupLoop;
      used += addition.length;
      body.push(...(chunkOpen ? [] : chunk), ...entryLines);
      chunkOpen = true;
      chunk = [];
      shown += 1;
    }
    body.push("");
    lastProject = group.project;
  }

  const lines = [...opening, ...body];
  const omitted = total - shown;
  if (omitted > 0) {
    lines.push(`_… and ${plural(omitted, "more finding")} not shown. Use \`--format json\` for the complete list._`, "");
  }
  if (closing) lines.push(closing);
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
};

/** Full Markdown document: summary followed by the findings list, never longer than `maxLength`. */
export const renderMarkdown = (report: Report, options: MarkdownOptions = {}): string => {
  const maxLength = options.maxLength ?? GITHUB_COMMENT_LIMIT;
  const notice = "\n_… output truncated to fit the size limit._\n";
  let summary = renderMarkdownSummary(report, options);
  if (summary.length > maxLength - RESERVED_FOOTER_LENGTH) {
    summary = `${cutTo(summary, maxLength - notice.length - 1)}${notice}`;
    return summary.slice(0, maxLength);
  }
  const findings = renderMarkdownFindings(report, options, maxLength - summary.length - 1);
  return findings === "" ? summary : `${summary}\n${findings}`;
};
