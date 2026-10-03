import type { Report, ReportFinding } from "../report/model.js";
import {
  renderMarkdownSummary,
  renderMarkdownFinding,
  SUMMARY_MARKER,
  promptOf,
} from "../report/format-markdown.js";
import { escapeMarkdown, markdownCode, markdownFence, sanitizeMarkerId } from "../report/markdown-escape.js";
import type { GitHubClient } from "./github-client.js";
import { logger } from "../utils/logger.js";

export type FeedbackMode = "summary" | "annotations" | "findings" | "none";
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
}

export interface CommentGroup {
  marker: string;
  path: string;
  line: number;
  ruleId: string;
  findings: ReportFinding[];
  body: string;
}

export const FINDING_MARKER_PREFIX = "<!-- vue-doctor:finding:";

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
): CommentGroup[] => {
  if (findings.length === 0) return [];

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
        body,
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
      body: lines.join("\n") + "\n",
    });
  }

  return commentGroups;
};

/**
 * Handles the sticky summary comment on the PR.
 */
export const postStickySummary = async (
  client: GitHubClient,
  options: FeedbackOptions,
  report: Report,
): Promise<void> => {
  if (!options.pullNumber) return;

  const summaryMarkdown = renderMarkdownSummary(report, {
    stickyMarker: true,
    collapseFindings: true,
  });

  const comments = await client.listIssueComments(options.owner, options.repo, options.pullNumber);
  const existing = comments.find((c) => c.body?.includes(SUMMARY_MARKER));

  if (existing) {
    if (existing.body !== summaryMarkdown) {
      logger.log(`Updating sticky summary comment #${existing.id}...`);
      await client.updateIssueComment(options.owner, options.repo, existing.id, summaryMarkdown);
    } else {
      logger.log(`Sticky summary comment #${existing.id} is up to date.`);
    }
  } else {
    logger.log("Posting new sticky summary comment...");
    await client.createIssueComment(options.owner, options.repo, options.pullNumber, summaryMarkdown);
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

  const allFindings = report.projects.flatMap((p) => p.findings);
  const groups = groupFindings(allFindings, options.grouping, options.agentPrompt);

  const activeGroups = groups.slice(0, options.maxComments);
  const activeMarkers = new Set(activeGroups.map((g) => g.marker));

  // Retrieve existing review comments
  const existingComments = await client.listReviewComments(options.owner, options.repo, options.pullNumber);
  const trackedComments = new Map<string, { id: number; body: string }>();

  for (const c of existingComments) {
    const marker = extractFindingMarker(c.body);
    if (marker) {
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
 * Emits inline GitHub Action workflow annotations to stdout/stderr.
 */
export const emitAnnotations = (report: Report): void => {
  for (const project of report.projects) {
    for (const finding of project.findings) {
      const level = finding.severity === "error" ? "error" : "warning";
      const file = finding.file;
      const line = finding.line > 0 ? finding.line : 1;
      const col = finding.column > 0 ? finding.column : 1;
      const msg = `[${finding.ruleId}] ${finding.message}`;
      // Format: ::error file={name},line={line},col={col}::{message}
      console.log(`::${level} file=${file},line=${line},col=${col}::${msg}`);
    }
  }
};
