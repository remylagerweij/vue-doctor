import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { getCanonicalRuleId, RULE_REGISTRY } from "../plugin/registry.js";
import type { Report, ReportFinding, ReportProject } from "./model.js";

/**
 * SARIF 2.1.0 output for GitHub code scanning (`github/codeql-action/upload-sarif`), built from the
 * `report@2` model.
 *
 * Design decisions:
 * - One `run` per project. GitHub accepts several runs from the same tool in one file only when
 *   each has a distinct `automationDetails.id`, so every run gets `vue-doctor/<project root>/`.
 * - `driver.rules` lists the rules that have results in that run (not the whole registry): code
 *   scanning only shows rules with alerts, `knip/*` rules have no registry entry, and it keeps the
 *   file small.
 * - Locations are POSIX paths relative to the source root (`sourceRootPrefix` + `project.root` +
 *   `file`) with `uriBaseId: "%SRCROOT%"`. The CLI passes the path from the git repository root to
 *   the scanned directory, so the paths match the checkout whatever directory Vue Doctor scanned.
 * - No source text is emitted (no code frames), so a secret in the scanned code never reaches the file.
 * - Inline-suppressed findings are not part of the report, so no `suppressions` are written.
 */

export const SARIF_SCHEMA_URL = "https://json.schemastore.org/sarif-2.1.0.json";
export const SARIF_INFORMATION_URI = "https://remylagerweij.github.io/vue-doctor/";
/** Key of `partialFingerprints`; bump the suffix if the fingerprint algorithm changes. */
export const SARIF_FINGERPRINT_KEY = "vueDoctor/v1";

/** GitHub rejects runs with more results than this. */
export const SARIF_MAX_RESULTS_PER_RUN = 25_000;
/** GitHub rejects gzip-compressed uploads larger than this. */
export const SARIF_MAX_GZIP_BYTES = 10 * 1024 * 1024;

type SarifLevel = "error" | "warning" | "note";

export interface SarifOptions {
  /** Receives one message per truncated run. */
  warn?: (message: string) => void;
  /**
   * POSIX path from `%SRCROOT%` (the repository root) to the directory the report's project roots are
   * relative to. Defaults to `""`: that directory is the repository root.
   */
  sourceRootPrefix?: string;
  /** Overrides {@link SARIF_MAX_RESULTS_PER_RUN} (tests). */
  maxResultsPerRun?: number;
  /** Overrides {@link SARIF_MAX_GZIP_BYTES} (tests). */
  maxGzipBytes?: number;
}

/**
 * `security-severity` (CVSS-like 0-10 string; GitHub: >=9 critical, 7-8.9 high, 4-6.9 medium, <4 low)
 * derived from the rule's default severity and its confidence.
 */
const SECURITY_SEVERITY: Record<ReportFinding["severity"], Record<ReportFinding["confidence"], string>> = {
  error: { high: "8.0", medium: "7.0", low: "5.0" },
  warning: { high: "6.0", medium: "5.0", low: "3.0" },
};

/** Errors and warnings keep their level; a low-confidence warning is only a `note`. */
const toLevel = (severity: ReportFinding["severity"], confidence: ReportFinding["confidence"]): SarifLevel =>
  severity === "error" ? "error" : confidence === "low" ? "note" : "warning";

const slugify = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** PascalCase of the last rule-id segment, as SARIF `name` conventionally is (`no-v-html` -> `NoVHtml`). */
const toRuleName = (ruleId: string): string =>
  (ruleId.split("/").at(-1) ?? ruleId)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");

const REGISTRY_BY_ID = new Map(RULE_REGISTRY.map((meta) => [getCanonicalRuleId(meta), meta]));

/** `external/cwe/cwe-79` is the tag GitHub turns into a CWE badge. */
const cweTag = (cwe: string): string => `external/cwe/${cwe.toLowerCase()}`;

const toRuleDescriptor = (finding: ReportFinding) => {
  const meta = REGISTRY_BY_ID.get(finding.ruleId);
  const isSecurity = finding.category === "Security";
  const defaultSeverity = meta && meta.defaultSeverity !== "off" ? meta.defaultSeverity : finding.severity;
  const tags = [...new Set([slugify(finding.category), ...(isSecurity ? ["security"] : []), ...(finding.cwe ?? []).map(cweTag)])];
  const helpText = `${finding.help}\n\nDocumentation: ${finding.docsUrl}`;
  return {
    id: finding.ruleId,
    name: toRuleName(finding.ruleId),
    shortDescription: { text: finding.help },
    fullDescription: { text: finding.help },
    help: { text: helpText, markdown: `${finding.help}\n\n[Documentation](${finding.docsUrl})` },
    helpUri: finding.docsUrl,
    defaultConfiguration: {
      level: toLevel(defaultSeverity, finding.confidence),
    },
    properties: {
      category: finding.category,
      tags,
      precision: finding.confidence,
      ...(finding.owasp ? { owasp: finding.owasp } : {}),
      ...(isSecurity ? { "security-severity": SECURITY_SEVERITY[defaultSeverity][finding.confidence] } : {}),
    },
  };
};

/** Relative, URL-encoded POSIX path of a finding from the directory Vue Doctor ran in. */
const toLocationUri = (projectRoot: string, file: string): { uri: string; uriBaseId?: string } => {
  const joined = projectRoot === "." || projectRoot === "" ? file : `${projectRoot}/${file}`;
  // An absolute path (a file outside the project) cannot be relative to the repository root.
  if (/^([A-Za-z]:)?\//.test(joined)) return { uri: pathToFileURL(joined).href };
  const segments: string[] = [];
  for (const segment of joined.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments.at(-1) !== "..") segments.pop();
      else segments.push(segment);
    } else segments.push(segment);
  }
  return { uri: segments.map((segment) => (segment === ".." ? segment : encodeURIComponent(segment))).join("/"), uriBaseId: "%SRCROOT%" };
};

const toRegion = (finding: ReportFinding) => {
  // 0 means "whole file" / "unknown column"; SARIF lines and columns start at 1.
  if (finding.line < 1) return undefined;
  const hasEnd = finding.endLine !== undefined && finding.endLine >= finding.line;
  return {
    startLine: finding.line,
    ...(finding.column >= 1 ? { startColumn: finding.column } : {}),
    ...(hasEnd ? { endLine: finding.endLine } : {}),
    ...(hasEnd && finding.endColumn !== undefined && finding.endColumn >= 1 ? { endColumn: finding.endColumn } : {}),
  };
};

const BASELINE_STATE: Record<NonNullable<ReportFinding["status"]>, "new" | "unchanged"> = {
  new: "new",
  existing: "unchanged",
  baseline: "unchanged",
};

const toResult = (finding: ReportFinding, project: ReportProject, ruleIndex: number) => {
  const region = toRegion(finding);
  const fingerprint = finding.fingerprint
    ? // Two projects can contain the same relative file; make the fingerprint unique across runs' files.
      project.root === "." ? finding.fingerprint : `${finding.fingerprint}:${project.root}`
    : undefined;
  return {
    ruleId: finding.ruleId,
    ruleIndex,
    level: toLevel(finding.severity, finding.confidence),
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: toLocationUri(project.root, finding.file),
          ...(region ? { region } : {}),
        },
      },
    ],
    ...(fingerprint ? { partialFingerprints: { [SARIF_FINGERPRINT_KEY]: fingerprint } } : {}),
    ...(finding.status ? { baselineState: BASELINE_STATE[finding.status] } : {}),
  };
};

/**
 * Keeps at most `limit` findings: errors first, then warnings, each in report order (file, line,
 * column, rule), so which findings survive is deterministic. The survivors keep the report order.
 */
const truncateFindings = (findings: ReportFinding[], limit: number): ReportFinding[] => {
  if (findings.length <= limit) return findings;
  const ranked = findings
    .map((finding, index) => ({ finding, index }))
    .sort((left, right) => Number(right.finding.severity === "error") - Number(left.finding.severity === "error") || left.index - right.index)
    .slice(0, limit)
    .sort((left, right) => left.index - right.index);
  return ranked.map(({ finding }) => finding);
};

const toAutomationId = (project: ReportProject): string => {
  const root = project.root.split("/").filter((part) => part !== "" && part !== ".").join("/");
  return root === "" ? "vue-doctor/" : `vue-doctor/${root}/`;
};

const buildRun = (project: ReportProject, report: Report, limit: number, warn: (message: string) => void) => {
  const findings = truncateFindings(project.findings, limit);
  const truncated = project.findings.length - findings.length;
  if (truncated > 0) {
    warn(
      `SARIF: project "${project.name}" has ${project.findings.length} findings; only ${findings.length} are included (GitHub accepts at most ${SARIF_MAX_RESULTS_PER_RUN} results per run or ${SARIF_MAX_GZIP_BYTES / 1024 / 1024} MB gzipped). Errors are kept first.`,
    );
  }

  const ruleIndexes = new Map<string, number>();
  const rules: ReturnType<typeof toRuleDescriptor>[] = [];
  const results = findings.map((finding) => {
    let index = ruleIndexes.get(finding.ruleId);
    if (index === undefined) {
      index = rules.push(toRuleDescriptor(finding)) - 1;
      ruleIndexes.set(finding.ruleId, index);
    }
    return toResult(finding, project, index);
  });

  const notifications = [
    ...project.skipped.map((entry) => ({
      level: "warning" as const,
      message: { text: `${entry.tool} did not run: ${entry.reason}` },
    })),
    ...(truncated > 0
      ? [{ level: "warning" as const, message: { text: `${truncated} findings were omitted to stay within GitHub's upload limits.` } }]
      : []),
  ];

  return {
    tool: {
      driver: {
        name: "Vue Doctor",
        semanticVersion: report.tool.version,
        informationUri: SARIF_INFORMATION_URI,
        rules,
      },
    },
    automationDetails: { id: toAutomationId(project) },
    invocations: [{ executionSuccessful: true, ...(notifications.length > 0 ? { toolExecutionNotifications: notifications } : {}) }],
    columnKind: "utf16CodeUnits",
    results,
    properties: { project: project.name, score: project.score.value, ...(truncated > 0 ? { omittedResults: truncated } : {}) },
  };
};

const buildSarif = (report: Report, limit: number, warn: (message: string) => void) => ({
  $schema: SARIF_SCHEMA_URL,
  version: "2.1.0" as const,
  runs: report.projects.map((project) => buildRun(project, report, limit, warn)),
});

/** Re-roots every project at the source root, so locations, run ids and fingerprints agree. */
const withSourceRootPrefix = (report: Report, prefix: string): Report => {
  const base = prefix.split("/").filter((part) => part !== "" && part !== ".").join("/");
  if (base === "") return report;
  return {
    ...report,
    projects: report.projects.map((project) => ({
      ...project,
      root: project.root === "." || project.root === "" ? base : `${base}/${project.root}`,
    })),
  };
};

/** One SARIF 2.1.0 log, pretty-printed, ending with a newline. */
export const formatSarif = (inputReport: Report, options: SarifOptions = {}): string => {
  const report = withSourceRootPrefix(inputReport, options.sourceRootPrefix ?? "");
  const warn = options.warn ?? (() => {});
  const maxGzipBytes = options.maxGzipBytes ?? SARIF_MAX_GZIP_BYTES;
  let limit = Math.min(options.maxResultsPerRun ?? SARIF_MAX_RESULTS_PER_RUN, SARIF_MAX_RESULTS_PER_RUN);
  let text = `${JSON.stringify(buildSarif(report, limit, warn), null, 2)}\n`;
  // Still too large (very long messages): halve the per-run budget until the upload fits.
  while (gzipSync(text).length > maxGzipBytes && limit > 1) {
    limit = Math.floor(limit / 2);
    text = `${JSON.stringify(buildSarif(report, limit, () => {}), null, 2)}\n`;
    warn(`SARIF: output exceeded the ${maxGzipBytes} byte gzip limit; keeping at most ${limit} results per run.`);
  }
  return text;
};
