import type { Report, ReportFinding } from "../report/model.js";
import {
  renderMarkdownSummary,
  renderMarkdownFinding,
  sanitizeMarkerScope,
  summaryMarker,
  promptOf,
} from "../report/format-markdown.js";
import { escapeMarkdown, markdownCode, markdownFence, sanitizeMarkerId } from "../report/markdown-escape.js";
import { buildCombinedAgentPrompt } from "../report/agent-prompt.js";
import type { GitHubClient } from "./github-client.js";
import { formatGithub, toRepoPath } from "../report/format-github.js";
import { logger } from "../utils/logger.js";

export type FeedbackMode = "summary" | "annotations" | "findings" | "comment" | "review-comments" | "none";
export type GroupingMode = "finding" | "rule-per-file" | "rule";

export interface FeedbackOptions {
  feedback: FeedbackMode[];
  grouping: GroupingMode;
  maxComments: number;
  agentPrompt: boolean;
  owner: string;
  repo: string;
  pullNumber?: number;
  commitSha: string;
  scoreDelta?: number;
  baseScore?: number;
  /** POSIX path from the repository root to the scanned directory; review comments need repository paths. */
  sourceRootPrefix?: string;
}

export interface CommentGroup {
  marker: string;
  path: string;
  line: number;
  ruleId: string;
  findings: ReportFinding[];
  body: string;
}

export interface TrackedFinding {
  id: string;
  ruleId: string;
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning";
  help?: string;
  docsUrl?: string;
  category?: string;
  codeFrame?: string;
  fixed?: boolean;
}

export const FINDING_MARKER_PREFIX = "<!-- vue-doctor:finding:";
export const SCOPE_MARKER_PREFIX = "<!-- vue-doctor:scope:";
export const TRACKED_MARKER_PREFIX = "<!-- vue-doctor:tracked:";

export const findingIdentity = (f: { fingerprint?: string; file: string; line: number; ruleId: string }): string =>
  f.fingerprint ? f.fingerprint : `${f.file}:${f.line}:${f.ruleId}`;

export const extractTrackedFindings = (body: string): TrackedFinding[] => {
  const match = body.match(/<!-- vue-doctor:tracked:([a-zA-Z0-9+/=]+) -->/);
  if (match) {
    try {
      const json = Buffer.from(match[1], "base64").toString("utf8");
      return JSON.parse(json);
    } catch {
      // Fall through to regex parser fallback
    }
  }

  const findings: TrackedFinding[] = [];
  const fixedRegex = /- ~~(?:\S+\s+)?\*\*([A-Z]+)\*\*\s+`([^`]+)`:\s*(.*?)\s*\(`([^`]+)`\)~~/g;
  let m: RegExpExecArray | null;
  while ((m = fixedRegex.exec(body)) !== null) {
    const [, sev, loc, msg, rule] = m;
    const [file, lineStr] = loc.split(":");
    findings.push({
      id: `${file}:${lineStr || "1"}:${rule}`,
      ruleId: rule,
      file,
      line: parseInt(lineStr || "1", 10),
      message: msg,
      severity: sev.toLowerCase() === "error" ? "error" : "warning",
      fixed: true,
    });
  }
  return findings;
};

const normalizeScope = (prefix = ""): string =>
  prefix.split("/").filter((part) => part !== "" && part !== ".").join("/");

const scopeMarker = (scope: string): string => `${SCOPE_MARKER_PREFIX}${sanitizeMarkerScope(scope)} -->`;

/** The scanned directory a review comment belongs to; comments without a scope marker belong to the repository root. */
export const extractScope = (body: string): string => {
  const match = body.match(/<!-- vue-doctor:scope:([^\s]*) -->/);
  return match ? match[1] : "";
};

/**
 * Extracts the marker ID from a comment body if present.
 */
export const extractFindingMarker = (body: string): string | null => {
  const match = body.match(/<!-- vue-doctor:finding:([a-zA-Z0-9_-]+) -->/);
  return match ? match[1] : null;
};

/**
 * Groups findings according to the specified grouping mode.
 */
export const groupFindings = (
  findings: ReportFinding[],
  grouping: GroupingMode,
  agentPrompt: boolean,
  scope = "",
): CommentGroup[] => {
  if (findings.length === 0) return [];
  const withScope = (body: string): string => (scope ? `${body.trimEnd()}\n${scopeMarker(scope)}\n` : body);

  if (grouping === "finding") {
    return findings.map((finding) => {
      const markerId = sanitizeMarkerId(finding.fingerprint || `${finding.file}:${finding.line}:${finding.ruleId}`);
      const body = renderMarkdownFinding(finding, {
        marker: true,
        codeFrame: true,
        agentPrompt,
      });
      return {
        marker: markerId,
        path: finding.file,
        line: Math.max(1, finding.line),
        ruleId: finding.ruleId,
        findings: [finding],
        body: withScope(body),
      };
    });
  }

  // Group by rule-per-file or rule
  const groups = new Map<string, ReportFinding[]>();
  for (const finding of findings) {
    const key = grouping === "rule-per-file" ? `${finding.file}::${finding.ruleId}` : finding.ruleId;
    const list = groups.get(key) ?? [];
    list.push(finding);
    groups.set(key, list);
  }

  const commentGroups: CommentGroup[] = [];
  for (const groupList of groups.values()) {
    const first = groupList[0];
    const markerId = sanitizeMarkerId(
      grouping === "rule-per-file"
        ? `${first.file}::${first.ruleId}`
        : `rule::${first.ruleId}`,
    );

    const lines: string[] = [
      `<!-- vue-doctor:finding:${markerId} -->`,
      `### 🩺 ${markdownCode(first.ruleId)} (${groupList.length} ${groupList.length === 1 ? "finding" : "findings"})`,
      "",
    ];

    if (first.help) {
      lines.push(`**Help:** ${escapeMarkdown(first.help)}`, "");
    }

    for (const item of groupList) {
      const loc = item.line > 0 ? `${item.file}:${item.line}` : item.file;
      lines.push(`- **${item.severity.toUpperCase()}** ${markdownCode(loc)}: ${escapeMarkdown(item.message)}`);
      if (item.codeFrame && item.category !== "Security") {
        lines.push("", markdownFence(item.codeFrame, "text"), "");
      }
    }

    if (agentPrompt && first.agentPrompt) {
      lines.push(
        "",
        "<details>",
        "<summary>🤖 Fix with an AI agent</summary>",
        "",
        markdownFence(promptOf(first), "text"),
        "",
        "</details>",
      );
    }

    commentGroups.push({
      marker: markerId,
      path: first.file,
      line: Math.max(1, first.line),
      ruleId: first.ruleId,
      findings: groupList,
      body: withScope(lines.join("\n") + "\n"),
    });
  }

  return commentGroups;
};

/**
 * Formats a single unified PR comment containing the score summary, all active findings
 * grouped together, fixed earlier findings (crossed through), and a single combined AI agent prompt.
 */
export const renderStickyComment = (
  report: Report,
  options: FeedbackOptions,
  previousTracked: TrackedFinding[] = [],
): string => {
  const prefix = options.sourceRootPrefix ?? "";
  const scope = normalizeScope(prefix);

  const summaryMarkdown = renderMarkdownSummary(report, {
    stickyMarker: true,
    collapseFindings: true,
    scope,
  }).trimEnd();

  const currentFindings: ReportFinding[] = report.projects.flatMap((p) =>
    p.findings.map((finding) => ({ ...finding, file: toRepoPath(prefix, p.root, finding.file) })),
  );

  const currentKeySet = new Set(currentFindings.map(findingIdentity));
  const activeFindings = currentFindings;

  const fixedFindings: TrackedFinding[] = [];
  const seenFixedIds = new Set<string>();

  for (const prev of previousTracked) {
    if (!currentKeySet.has(prev.id) && !seenFixedIds.has(prev.id)) {
      fixedFindings.push({ ...prev, fixed: true });
      seenFixedIds.add(prev.id);
    }
  }

  fixedFindings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId));

  const sections: string[] = [summaryMarkdown];

  if (activeFindings.length > 0) {
    sections.push("");
    const heading = fixedFindings.length > 0
      ? `### 📋 Remaining issues (${activeFindings.length})`
      : `### 📋 Issues (${activeFindings.length})`;
    sections.push(heading, "");

    const groups = groupFindings(activeFindings, options.grouping ?? "rule-per-file", false, "");
    const maxComments = options.maxComments ?? 30;
    const shownGroups = groups.slice(0, maxComments);

    for (const group of shownGroups) {
      const cleaned = group.body
        .replace(/^<!-- vue-doctor:finding:[^\n]+\n/m, "")
        .replace(/^### 🩺/m, "#### 🩺")
        .trimEnd();
      sections.push(cleaned);
      sections.push("");
    }

    if (groups.length > shownGroups.length) {
      const omitted = groups.length - shownGroups.length;
      sections.push(`_… and ${omitted} more issue groups not shown._`, "");
    }
  }

  if (fixedFindings.length > 0) {
    sections.push("");
    sections.push(`### ✅ Fixed earlier findings (${fixedFindings.length})`, "");
    const maxComments = options.maxComments ?? 30;
    const shownFixed = fixedFindings.slice(0, maxComments);

    for (const fixed of shownFixed) {
      const icon = fixed.severity === "error" ? "🔴" : "⚠️";
      const loc = fixed.line > 0 ? `${fixed.file}:${fixed.line}` : fixed.file;
      sections.push(
        `- ~~${icon} **${fixed.severity.toUpperCase()}** ${markdownCode(loc)}: ${escapeMarkdown(fixed.message)} (${markdownCode(fixed.ruleId)})~~`,
      );
    }

    if (fixedFindings.length > shownFixed.length) {
      const omitted = fixedFindings.length - shownFixed.length;
      sections.push(`_… and ${omitted} more fixed findings not shown._`);
    }
    sections.push("");
  }

  if (options.agentPrompt !== false && activeFindings.length > 0) {
    const promptText = buildCombinedAgentPrompt(activeFindings, {
      projectRoot: options.sourceRootPrefix || ".",
    });
    if (promptText) {
      sections.push(
        "",
        "<details>",
        "<summary>🤖 Fix remaining issues with an AI agent</summary>",
        "",
        markdownFence(promptText, "text"),
        "",
        "</details>",
        "",
      );
    }
  }

  const newTracked: TrackedFinding[] = [
    ...activeFindings.map((f) => ({
      id: findingIdentity(f),
      ruleId: f.ruleId,
      file: f.file,
      line: f.line,
      message: f.message,
      severity: f.severity,
      help: f.help,
      docsUrl: f.docsUrl,
      category: f.category,
      codeFrame: f.codeFrame,
      fixed: false,
    })),
    ...fixedFindings.map((f) => ({
      id: f.id,
      ruleId: f.ruleId,
      file: f.file,
      line: f.line,
      message: f.message,
      severity: f.severity,
      help: f.help,
      docsUrl: f.docsUrl,
      category: f.category,
      codeFrame: f.codeFrame,
      fixed: true,
    })),
  ];

  const trackedBase64 = Buffer.from(JSON.stringify(newTracked)).toString("base64");
  sections.push(`<!-- vue-doctor:tracked:${trackedBase64} -->`);

  return `${sections.join("\n").replace(/\n+$/, "")}\n`;
};

/**
 * Handles the single sticky PR comment containing summary, grouped issues, fixed earlier findings, and agent prompt.
 */
export const postStickySummary = async (
  client: GitHubClient,
  options: FeedbackOptions,
  report: Report,
): Promise<void> => {
  if (!options.pullNumber) return;

  const scope = normalizeScope(options.sourceRootPrefix);
  const marker = summaryMarker(scope);
  const comments = await client.listIssueComments(options.owner, options.repo, options.pullNumber);
  const existing = comments.find((c) => c.body?.includes(marker));

  const previousTracked = existing?.body ? extractTrackedFindings(existing.body) : [];
  const commentMarkdown = renderStickyComment(report, options, previousTracked);

  if (existing) {
    if (existing.body !== commentMarkdown) {
      logger.log(`Updating sticky summary comment #${existing.id}...`);
      await client.updateIssueComment(options.owner, options.repo, existing.id, commentMarkdown);
    } else {
      logger.log(`Sticky summary comment #${existing.id} is up to date.`);
    }
  } else {
    logger.log("Posting new sticky summary comment...");
    await client.createIssueComment(options.owner, options.repo, options.pullNumber, commentMarkdown);
  }
};

/**
 * Handles posting review comments on the PR with grouping, caps, and cleanup of stale comments.
 */
export const postReviewComments = async (
  client: GitHubClient,
  options: FeedbackOptions,
  report: Report,
): Promise<void> => {
  if (!options.pullNumber) return;

  const prefix = options.sourceRootPrefix ?? "";
  const scope = normalizeScope(prefix);
  const allFindings = report.projects.flatMap((p) =>
    p.findings.map((finding) => ({ ...finding, file: toRepoPath(prefix, p.root, finding.file) })),
  );
  const groups = groupFindings(allFindings, options.grouping, options.agentPrompt, scope);

  const activeGroups = groups.slice(0, options.maxComments);
  const activeMarkers = new Set(activeGroups.map((g) => g.marker));

  // Retrieve existing review comments
  const existingComments = await client.listReviewComments(options.owner, options.repo, options.pullNumber);
  const trackedComments = new Map<string, { id: number; body: string }>();

  for (const c of existingComments) {
    const marker = extractFindingMarker(c.body);
    // Other scans of the same PR (one per monorepo project) own their own comments.
    if (marker && extractScope(c.body) === scope) {
      trackedComments.set(marker, { id: c.id, body: c.body });
    }
  }

  // Update existing or post new comments
  for (const group of activeGroups) {
    const existing = trackedComments.get(group.marker);
    if (existing) {
      if (existing.body !== group.body) {
        logger.log(`Updating review comment #${existing.id} (${group.ruleId})...`);
        await client.updateReviewComment(options.owner, options.repo, existing.id, group.body);
      }
    } else {
      try {
        logger.log(`Creating review comment for ${group.path}:${group.line} (${group.ruleId})...`);
        await client.createReviewComment(options.owner, options.repo, options.pullNumber, {
          body: group.body,
          commit_id: options.commitSha,
          path: group.path,
          line: group.line,
        });
      } catch (err: any) {
        // Line might not be in diff on PR; log warning and continue
        logger.warn(`Could not anchor review comment at ${group.path}:${group.line}: ${err.message}`);
      }
    }
  }

  // Delete or resolve stale comments that no longer exist
  for (const [marker, comment] of trackedComments) {
    if (!activeMarkers.has(marker)) {
      logger.log(`Removing resolved finding review comment #${comment.id}...`);
      try {
        await client.deleteReviewComment(options.owner, options.repo, comment.id);
      } catch (err: any) {
        logger.warn(`Could not remove stale review comment #${comment.id}: ${err.message}`);
      }
    }
  }
};

/**
 * Posts commit status to the GitHub Status API.
 */
export const postCommitStatus = async (
  client: GitHubClient,
  options: FeedbackOptions,
  report: Report,
  passedGate: boolean,
): Promise<void> => {
  const score = report.projects[0]?.score.value ?? 100;
  const errors = report.summary.errors;
  const warnings = report.summary.warnings;

  let desc = `Score: ${score}/100 · ${errors} errors, ${warnings} warnings`;
  if (options.scoreDelta !== undefined) {
    const sign = options.scoreDelta >= 0 ? "+" : "";
    desc = `Vue Doctor ${score} (${sign}${options.scoreDelta}) · ${errors} errors, ${warnings} warnings`;
  }

  const state = passedGate ? "success" : "failure";
  logger.log(`Setting commit status on ${options.commitSha.slice(0, 7)}: ${desc}`);

  await client.createCommitStatus(options.owner, options.repo, options.commitSha, {
    state,
    description: desc.slice(0, 140),
    context: "vue-doctor",
  });
};

/**
 * Emits inline GitHub Action workflow annotations to stdout, with repository-relative paths.
 */
export const emitAnnotations = (report: Report, sourceRootPrefix = ""): void => {
  const output = formatGithub(report, { sourceRootPrefix });
  if (output) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
};
