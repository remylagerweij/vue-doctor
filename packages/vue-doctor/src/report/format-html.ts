import { createHash } from "node:crypto";
import { DOCS_BASE_URL } from "../constants.js";
import { promptOf } from "./format-markdown.js";
import { REPORT_SCRIPT, REPORT_STYLES } from "./html-assets.js";
import { toTrustedUrl } from "./markdown-escape.js";
import type { Report, ReportFinding, ReportProject } from "./model.js";

/**
 * `--format html`: one self-contained file (inline CSS and JS, no external request) built from the
 * `report@2` model, meant to be opened locally or attached as a CI artifact.
 *
 * Design decisions:
 * - The findings travel as JSON in a `<script type="application/json">` block and the inline script
 *   builds the page with `textContent`, never `innerHTML`; scanned text therefore cannot become
 *   markup. The JSON is escaped so it cannot end its own script block (`</script`), open a comment
 *   (`<!--`) or break a JS line (U+2028/2029). The few strings written into the static HTML (title,
 *   no-JS summary) are HTML-escaped.
 * - A Content-Security-Policy meta tag allows only the two inline blocks, by hash, and nothing else
 *   (`default-src 'none'`): no network, no frames, no forms.
 * - Documentation links only point to the trusted docs origin. Security findings never show source:
 *   no code frame, and the frame is cut out of the AI prompt too (same rule as the Markdown output).
 * - Every finding is embedded (the page lists them in pages of 100); rule-level text is stored once
 *   and a prompt does not repeat its code frame, which keeps 5,000 findings around 6 MB.
 */

export interface HtmlOptions {
  /** Overrides the trusted documentation origin (tests). */
  docsBaseUrl?: string;
}

/** Placeholder inside an embedded prompt where the finding's code frame belongs (see html-assets). */
const FRAME_MARKER = "\u0001";

interface HtmlRule {
  id: string;
  category: string;
  /** Trusted documentation URL, or "" when the rule has none. */
  docs: string;
  help: string;
}

interface HtmlFinding {
  /** Index into `projects`. */
  p: number;
  /** Index into `rules`. */
  r: number;
  s: ReportFinding["severity"];
  f: string;
  l: number;
  c: number;
  m: string;
  /** Help text, only when it differs from the rule's. */
  h?: string;
  cf?: string;
  st?: ReportFinding["status"];
  ap: string;
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** Built from char codes so the source file itself contains no line separator characters. */
const SCRIPT_UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, "g");

/**
 * JSON that is safe inside a `<script>` element and inside JS: `<`, `>` and `&` become `\uXXXX`
 * (so neither `</script` nor `<!--` can occur) and so do the line separators U+2028/U+2029.
 */
export const jsonForScript = (value: unknown): string =>
  JSON.stringify(value).replace(SCRIPT_UNSAFE, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);

const sha256Source = (content: string): string => `'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`;

const trustedDocsUrl = (url: string, docsBaseUrl: string): string => toTrustedUrl(url, docsBaseUrl) ?? "";

const embeddedFinding = (finding: ReportFinding, projectIndex: number, ruleIndex: number, rule: HtmlRule): HtmlFinding => {
  const isSecurity = finding.category === "Security";
  const frame = isSecurity ? undefined : finding.codeFrame;
  let prompt = promptOf(finding);
  if (frame && prompt.includes(frame)) prompt = prompt.replace(frame, () => FRAME_MARKER);
  return {
    p: projectIndex,
    r: ruleIndex,
    s: finding.severity,
    f: finding.file,
    l: finding.line,
    c: finding.column,
    m: finding.message,
    ...(finding.help !== rule.help ? { h: finding.help } : {}),
    ...(frame ? { cf: frame } : {}),
    ...(finding.status ? { st: finding.status } : {}),
    ap: prompt,
  };
};

const embeddedProject = (project: ReportProject) => ({
  name: project.name,
  root: project.root,
  framework: project.framework,
  vueVersion: project.vueVersion,
  typescript: project.typescript,
  sourceFiles: project.sourceFiles,
  scope: project.scope,
  score: project.score,
  summary: project.summary,
  skipped: project.skipped,
  ...(project.baseline ? { baseline: project.baseline } : {}),
  ruleGroups: project.ruleGroups,
});

const buildPageData = (report: Report, docsBaseUrl: string) => {
  const rules: HtmlRule[] = [];
  const ruleIndexes = new Map<string, number>();
  const findings: HtmlFinding[] = [];
  report.projects.forEach((project, projectIndex) => {
    for (const finding of project.findings) {
      let ruleIndex = ruleIndexes.get(finding.ruleId);
      if (ruleIndex === undefined) {
        ruleIndex = rules.length;
        ruleIndexes.set(finding.ruleId, ruleIndex);
        rules.push({
          id: finding.ruleId,
          category: finding.category,
          docs: trustedDocsUrl(finding.docsUrl, docsBaseUrl),
          help: finding.help,
        });
      }
      findings.push(embeddedFinding(finding, projectIndex, ruleIndex, rules[ruleIndex]));
    }
  });
  return {
    tool: report.tool,
    generatedAt: report.generatedAt ?? null,
    scoreVersion: report.scoreVersion,
    docsOrigin: new URL(docsBaseUrl).origin,
    projects: report.projects.map(embeddedProject),
    rules,
    findings,
  };
};

const plural = (count: number, singular: string): string => `${count} ${singular}${count === 1 ? "" : "s"}`;

/** What shows without JavaScript: the score and counts of each project. */
const staticSummary = (report: Report): string =>
  report.projects
    .map(
      (project) =>
        `<article class="vd-card"><h3>${escapeHtml(project.name)}</h3><p>Score <strong>${project.score.value}/100</strong> (${escapeHtml(project.score.label)}) &middot; ${plural(project.summary.errors, "error")} &middot; ${plural(project.summary.warnings, "warning")}</p></article>`,
    )
    .join("");

const pageTitle = (report: Report): string => {
  const names = report.projects.map((project) => project.name).join(", ");
  return `Vue Doctor report${names ? ` - ${names.length > 80 ? `${names.slice(0, 79)}…` : names}` : ""}`;
};

const FILTERS = `<form id="vd-filter-form" class="vd-filters" role="search" aria-label="Filter findings">
<label>Search file, message or rule<input id="vd-f-query" type="search" autocomplete="off"></label>
<label>Severity<select id="vd-f-severity"><option value="">All</option></select></label>
<label>Category<select id="vd-f-category"><option value="">All</option></select></label>
<label>Rule<select id="vd-f-rule"><option value="">All</option></select></label>
<label id="vd-f-project-label">Project<select id="vd-f-project"><option value="">All</option></select></label>
<label>Sort<select id="vd-f-sort"><option value="file">File order</option></select></label>
<label id="vd-f-new-label" class="vd-check"><input id="vd-f-new" type="checkbox"> New findings only</label>
<button id="vd-f-reset" class="vd-btn" type="button">Reset filters</button>
</form>`;

/** The complete HTML document. */
export const formatHtml = (report: Report, options: HtmlOptions = {}): string => {
  const docsBaseUrl = options.docsBaseUrl ?? DOCS_BASE_URL;
  const policy = [
    "default-src 'none'",
    `style-src ${sha256Source(REPORT_STYLES)}`,
    `script-src ${sha256Source(REPORT_SCRIPT)}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const generated = report.generatedAt ? ` &middot; generated ${escapeHtml(report.generatedAt)}` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(pageTitle(report))}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<a class="vd-skip" href="#vd-findings-heading">Skip to findings</a>
<div class="vd-top"><div class="vd-wrap">
<div><h1>Vue Doctor report</h1><div class="vd-muted">v${escapeHtml(report.tool.version)} &middot; ${plural(report.summary.projects, "project")} &middot; ${plural(report.summary.errors, "error")} &middot; ${plural(report.summary.warnings, "warning")}${generated}</div></div>
<button id="vd-theme" class="vd-btn" type="button">Switch theme</button>
</div></div>
<main class="vd-wrap">
<noscript><p class="vd-note">This report needs JavaScript to list findings. The summary below works without it.</p></noscript>
<section aria-labelledby="vd-projects-heading">
<h2 id="vd-projects-heading">Projects</h2>
<div id="vd-projects" class="vd-projects">${staticSummary(report)}</div>
</section>
<section id="vd-findings" aria-labelledby="vd-findings-heading">
<h2 id="vd-findings-heading" tabindex="-1">Findings</h2>
${FILTERS}
<p id="vd-count" class="vd-count" aria-live="polite"></p>
<ol id="vd-list" class="vd-findings"></ol>
<div id="vd-more" class="vd-more"></div>
</section>
</main>
<footer class="vd-wrap">Generated by Vue Doctor. Score formula version ${report.scoreVersion}. This file is self-contained: it makes no network requests.</footer>
<div id="vd-status" class="vd-sr" role="status" aria-live="polite"></div>
<script type="application/json" id="vd-data">${jsonForScript(buildPageData(report, docsBaseUrl))}</script>
<script>${REPORT_SCRIPT}</script>
</body>
</html>
`;
};
