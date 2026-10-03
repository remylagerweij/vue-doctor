import fs from "node:fs";
import path from "node:path";
import type { AnalyzerName, DiagnoseResult } from "../core/diagnose.js";
import { getRuleMeta, PLUGIN_NAME } from "../plugin/registry.js";
import { ruleIdOf } from "../plugin/rule-ids.js";
import type { Diagnostic } from "../types.js";
import { docsUrl } from "../utils/docs-url.js";
import { buildAgentPrompt, buildGroupPrompt } from "./agent-prompt.js";
import { SCORE_VERSION } from "../constants.js";
import { REPORT_FORMAT, REPORT_SCHEMA_URL } from "./constants.js";
import type { Report, ReportFinding, ReportProject } from "./model.js";

/** Context lines shown before and after the finding in `codeFrame`. */
const CODE_FRAME_CONTEXT_LINES = 2;
/** Longer lines (minified code, data URIs) are cut so a frame never bloats the report. */
const CODE_FRAME_MAX_LINE_LENGTH = 200;

/** Tool name per analyzer, as reported in `skipped`. */
const ANALYZER_TOOLS: Record<AnalyzerName, string> = {
  lint: "oxlint",
  template: "eslint",
  "dead-code": "knip",
  project: "vue-doctor",
  audit: "osv.dev",
};

export interface ProjectResult {
  /** Project directory that was scanned. */
  directory: string;
  result: DiagnoseResult;
}

export interface BuildReportOptions {
  /** Version of Vue Doctor that produced the report. */
  version: string;
  /**
   * Time the report was generated. `null` omits every run-dependent field (`generatedAt` and the
   * timings), which makes two runs over the same code byte-identical.
   */
  generatedAt: Date | null;
  /**
   * The scanned directory (the CLI directory argument): `projects[].root` is relative to it, with `.`
   * for the project at that directory. Not the process working directory, which is unrelated to the scan.
   */
  scanDirectory: string;
}

const toPosix = (filePath: string): string => filePath.replaceAll("\\", "/");

const isInside = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/** `path` as POSIX, relative to `base`; falls back to the absolute path when there is no relative form. */
const relativePosix = (base: string, target: string): string => {
  const relative = path.relative(base, target);
  if (path.isAbsolute(relative)) return toPosix(target);
  return toPosix(relative === "" ? "." : relative);
};

const slugify = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Own rules live at `rules/<category>/<rule>`; other tools' rules at `rules/<category>/<namespace>-<rule>`. */
const ruleDocsUrl = (category: string, ruleId: string): string =>
  ruleId.startsWith(`${PLUGIN_NAME}/`)
    ? docsUrl(`rules/${ruleId.slice(PLUGIN_NAME.length + 1)}`)
    : docsUrl(`rules/${slugify(category)}/${ruleId.replaceAll("/", "-")}`);

/** Reads source lines read-only, once per file; unreadable files simply have no code frames. */
const createSourceReader = (projectRoot: string) => {
  const cache = new Map<string, string[] | null>();
  return (relativeFile: string): string[] | null => {
    const cached = cache.get(relativeFile);
    if (cached !== undefined) return cached;
    const absolute = path.resolve(projectRoot, relativeFile);
    let lines: string[] | null = null;
    // Findings of linters are project-relative, but never read outside the project regardless.
    if (isInside(projectRoot, absolute)) {
      try {
        lines = fs.readFileSync(absolute, "utf-8").split(/\r?\n/);
      } catch {
        lines = null;
      }
    }
    cache.set(relativeFile, lines);
    return lines;
  };
};

const createCodeFrame = (sourceLines: string[] | null, line: number): string | undefined => {
  if (!sourceLines || line < 1 || line > sourceLines.length) return undefined;
  const first = Math.max(1, line - CODE_FRAME_CONTEXT_LINES);
  const last = Math.min(sourceLines.length, line + CODE_FRAME_CONTEXT_LINES);
  const gutterWidth = String(last).length;
  const frame: string[] = [];
  for (let lineNumber = first; lineNumber <= last; lineNumber++) {
    const text = sourceLines[lineNumber - 1];
    const shown = text.length > CODE_FRAME_MAX_LINE_LENGTH ? `${text.slice(0, CODE_FRAME_MAX_LINE_LENGTH)}…` : text;
    frame.push(`${lineNumber === line ? ">" : " "} ${String(lineNumber).padStart(gutterWidth)} | ${shown}`);
  }
  return frame.join("\n");
};

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const compareFindings = (left: ReportFinding, right: ReportFinding): number =>
  compareText(left.file, right.file) ||
  left.line - right.line ||
  left.column - right.column ||
  compareText(left.ruleId, right.ruleId);

const toFinding = (
  diagnostic: Diagnostic,
  projectRoot: string,
  readSource: (file: string) => string[] | null,
  promptRoot: string,
): ReportFinding => {
  const absolute = path.resolve(projectRoot, diagnostic.filePath);
  const file = isInside(projectRoot, absolute) ? relativePosix(projectRoot, absolute) : toPosix(diagnostic.filePath);
  const ruleId = ruleIdOf(diagnostic);
  const meta = getRuleMeta(diagnostic.plugin, diagnostic.rule);
  const base = {
    ruleId,
    category: diagnostic.category,
    severity: diagnostic.severity,
    confidence: meta?.confidence ?? "medium",
    ...(meta?.cwe ? { cwe: meta.cwe } : {}),
    ...(meta?.owasp ? { owasp: meta.owasp } : {}),
    file,
    line: diagnostic.line,
    column: diagnostic.column,
    message: diagnostic.message,
    help: diagnostic.help,
    docsUrl: ruleDocsUrl(diagnostic.category, ruleId),
    // A frame of a credential finding would print the credential itself: it never leaves the scanner.
    codeFrame: meta?.critical ? undefined : createCodeFrame(readSource(file), diagnostic.line),
    ...(diagnostic.fingerprint ? { fingerprint: diagnostic.fingerprint } : {}),
    ...(diagnostic.status ? { status: diagnostic.status } : {}),
    fixable: meta?.fixable ?? false,
  };
  const withoutPrompt = { ...base, agentPrompt: "" };
  return { ...withoutPrompt, agentPrompt: buildAgentPrompt(withoutPrompt, { projectRoot: promptRoot }) };
};

/** One entry per rule with several findings, most findings first; `findings` is already in report order. */
const buildRuleGroups = (findings: ReportFinding[], projectRoot: string): ReportProject["ruleGroups"] => {
  const byRule = new Map<string, ReportFinding[]>();
  for (const finding of findings) {
    const group = byRule.get(finding.ruleId);
    if (group) group.push(finding);
    else byRule.set(finding.ruleId, [finding]);
  }
  return [...byRule.entries()]
    .filter(([, group]) => group.length >= 2)
    .sort(([leftId, left], [rightId, right]) => right.length - left.length || compareText(leftId, rightId))
    .map(([ruleId, group]) => ({ ruleId, count: group.length, agentPrompt: buildGroupPrompt(group, { projectRoot }) }));
};

const buildProject = ({ directory, result }: ProjectResult, options: BuildReportOptions): ReportProject => {
  const projectRoot = path.resolve(directory);
  const readSource = createSourceReader(projectRoot);
  const root = relativePosix(path.resolve(options.scanDirectory), projectRoot);
  const findings = result.diagnostics
    .map((diagnostic) => toFinding(diagnostic, projectRoot, readSource, root))
    .sort(compareFindings);
  const ruleGroups = buildRuleGroups(findings, root);

  const categories: ReportProject["categories"] = {};
  for (const finding of findings) {
    const counts = (categories[finding.category] ??= { errors: 0, warnings: 0 });
    if (finding.severity === "error") counts.errors++;
    else counts.warnings++;
  }
  const sortedCategories = Object.fromEntries(Object.entries(categories).sort(([a], [b]) => compareText(a, b)));

  const { baseline } = result;
  const baselinePath = baseline && path.resolve(projectRoot, baseline.path);
  return {
    name: result.project.projectName,
    root,
    framework: result.project.framework,
    vueVersion: result.project.vueVersion,
    typescript: result.project.hasTypeScript,
    sourceFiles: result.project.sourceFileCount,
    scope: result.isDiffMode
      ? { mode: "changed", files: result.includePaths.length }
      : { mode: "full" },
    score: {
      value: result.score,
      label: result.label,
      rawScore: result.rawScore,
      cap: result.scoreCap,
      categories: result.categoryScores,
      impact: result.impact,
    },
    categories: sortedCategories,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      suppressed: result.suppressed.count,
    },
    findings,
    ruleGroups,
    skipped: result.skipped.map((entry) => ({ tool: ANALYZER_TOOLS[entry.analyzer], reason: entry.reason })),
    // Timings differ on every run, so they go together with the timestamp.
    ...(options.generatedAt ? { timings: result.timings } : {}),
    suppressed: { count: result.suppressed.count, byRule: result.suppressed.byRule },
    ...(baseline && baselinePath
      ? {
          baseline: {
            path: isInside(projectRoot, baselinePath) ? relativePosix(projectRoot, baselinePath) : toPosix(baselinePath),
            matched: baseline.matched,
            new: baseline.new,
            fixed: baseline.fixed,
          },
        }
      : {}),
    offline: result.offline,
  };
};

/** Builds the `vue-doctor/report@2` document for the scanned projects (ordered by name). */
export const buildReport = (projectResults: ProjectResult[], options: BuildReportOptions): Report => {
  const projects = projectResults
    .map((projectResult) => buildProject(projectResult, options))
    .sort((left, right) => compareText(left.name, right.name) || compareText(left.root, right.root));
  return {
    $schema: REPORT_SCHEMA_URL,
    format: REPORT_FORMAT,
    scoreVersion: SCORE_VERSION,
    tool: { name: "vue-doctor", version: options.version },
    ...(options.generatedAt ? { generatedAt: options.generatedAt.toISOString() } : {}),
    summary: {
      projects: projects.length,
      errors: projects.reduce((total, project) => total + project.summary.errors, 0),
      warnings: projects.reduce((total, project) => total + project.summary.warnings, 0),
    },
    projects,
  };
};
