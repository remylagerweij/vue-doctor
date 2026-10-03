import { formatGithub } from "./format-github.js";
import { renderMarkdown, type MarkdownOptions } from "./format-markdown.js";
import { formatHtml } from "./format-html.js";
import { formatSarif, type SarifOptions } from "./format-sarif.js";
import type { JsonlFinding, JsonlSummary, Report } from "./model.js";

export const REPORT_FORMATS = ["text", "json", "jsonl", "sarif", "github", "markdown", "html"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** Machine-readable formats that `formatReport` can render (`text` is printed by `scan`). */
export type StructuredFormat = Exclude<ReportFormat, "text">;

/** One `report@2` document, pretty-printed, ending with a newline. */
export const formatJson = (report: Report): string => `${JSON.stringify(report, null, 2)}\n`;

/**
 * One self-contained finding per line (each names its project), then a `summary` line that carries
 * everything else (scores, skipped analyzers, timings) as the LAST line.
 */
export const formatJsonl = (report: Report): string => {
  const lines: string[] = [];
  for (const { findings, ...project } of report.projects) {
    for (const finding of findings) {
      const line: JsonlFinding = { type: "finding", project: project.name, ...finding };
      lines.push(JSON.stringify(line));
    }
  }
  const summary: JsonlSummary = {
    type: "summary",
    format: report.format,
    scoreVersion: report.scoreVersion,
    tool: report.tool,
    ...(report.generatedAt ? { generatedAt: report.generatedAt } : {}),
    summary: report.summary,
    projects: report.projects.map(({ findings: _findings, ...project }) => project),
  };
  lines.push(JSON.stringify(summary));
  return `${lines.join("\n")}\n`;
};

export const formatReport = (report: Report, format: StructuredFormat, options: SarifOptions & MarkdownOptions = {}): string => {
  if (format === "markdown") return renderMarkdown(report, options);
  if (format === "html") return formatHtml(report);
  if (format === "sarif") return formatSarif(report, options);
  if (format === "github") return formatGithub(report, options);
  return format === "json" ? formatJson(report) : formatJsonl(report);
};
