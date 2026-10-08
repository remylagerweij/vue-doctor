import type { Report, ReportFinding } from "./model.js";

/**
 * GitHub Actions workflow commands (`::error file=...::message`) built from the `report@2` model.
 * GitHub turns each line into an annotation on the pull request's changed lines, also on fork PRs
 * where the token has no write permission (SARIF upload needs `security-events: write`).
 *
 * Design decisions:
 * - One line per finding, ordered errors, warnings, notices (report order within a level). A
 *   low-confidence warning is a `notice`, mirroring SARIF's `note`.
 * - Only metadata and text of the finding are emitted (no code frames), so a secret in the scanned
 *   code never reaches the log.
 * - Every user-controlled value is escaped as in `@actions/core` (`toCommandValue` for the message,
 *   `toCommandProperty` for properties). Newlines are always escaped and a command is only
 *   recognised at the start of a line, so a finding can never emit a second workflow command
 *   (`::add-mask::`, `::stop-commands::`, `::set-output` ...) whatever its message or path contains.
 * - GitHub shows at most 10 error, 10 warning and 10 notice annotations per step (and 50 per job).
 *   All lines are emitted anyway (the log shows every one); when any level exceeds the limit a final
 *   `notice` says how many findings exist and how to see all of them.
 */

export const GITHUB_ANNOTATION_LIMIT_PER_LEVEL = 10;

type AnnotationLevel = "error" | "warning" | "notice";

export interface GithubOptions {
  /**
   * POSIX path from the repository root to the directory the report's project roots are relative to.
   * Defaults to `""`: that directory is the repository root.
   */
  sourceRootPrefix?: string;
}

/** Escaping of the message part (everything after the final `::`). */
const escapeData = (value: string): string => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/** Escaping of `key=value` properties: also the separators `:` and `,`. */
const escapeProperty = (value: string): string =>
  escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");

const toLevel = (finding: ReportFinding): AnnotationLevel =>
  finding.severity === "error" ? "error" : finding.confidence === "low" ? "notice" : "warning";

/** Repository-relative POSIX path of a finding (`..` segments are resolved; absolute paths stay as they are). */
export const toRepoPath = (prefix: string, projectRoot: string, file: string): string => {
  const joined = [prefix, projectRoot, file.replace(/\\/g, "/")].filter((part) => part !== "" && part !== ".").join("/");
  const absolute = /^([A-Za-z]:)?\//.test(joined);
  const segments: string[] = [];
  for (const segment of joined.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && segments.length > 0 && segments.at(-1) !== "..") segments.pop();
    else segments.push(segment);
  }
  return `${absolute && !/^[A-Za-z]:/.test(joined) ? "/" : ""}${segments.join("/")}`;
};

const toAnnotation = (finding: ReportFinding, level: AnnotationLevel, repoPath: string): string => {
  const properties: string[] = [`file=${escapeProperty(repoPath)}`];
  // 0 means "whole file" / "unknown column"; annotations without a line apply to the file.
  if (finding.line >= 1) {
    properties.push(`line=${finding.line}`);
    if (finding.column >= 1) properties.push(`col=${finding.column}`);
    const hasEnd = finding.endLine !== undefined && finding.endLine >= finding.line;
    if (hasEnd) {
      properties.push(`endLine=${finding.endLine}`);
      if (finding.endColumn !== undefined && finding.endColumn >= 1) properties.push(`endColumn=${finding.endColumn}`);
    }
  }
  properties.push(`title=${escapeProperty(finding.ruleId)}`);
  const message = [finding.message, finding.help, `Docs: ${finding.docsUrl}`].filter((part) => part !== "").join("\n");
  return `::${level} ${properties.join(",")}::${escapeData(message)}`;
};

const LEVEL_ORDER: AnnotationLevel[] = ["error", "warning", "notice"];

/** GitHub Actions workflow commands, one per line, ending with a newline; empty when there are no findings. */
export const formatGithub = (report: Report, options: GithubOptions = {}): string => {
  const prefix = (options.sourceRootPrefix ?? "").split("/").filter((part) => part !== "" && part !== ".").join("/");
  const byLevel: Record<AnnotationLevel, string[]> = { error: [], warning: [], notice: [] };
  for (const project of report.projects) {
    for (const finding of project.findings) {
      const level = toLevel(finding);
      byLevel[level].push(toAnnotation(finding, level, toRepoPath(prefix, project.root, finding.file)));
    }
  }
  const lines = LEVEL_ORDER.flatMap((level) => byLevel[level]);
  if (lines.length === 0) return "";

  const truncated = LEVEL_ORDER.some((level) => byLevel[level].length > GITHUB_ANNOTATION_LIMIT_PER_LEVEL);
  if (truncated) {
    const counts = `${byLevel.error.length} errors, ${byLevel.warning.length} warnings, ${byLevel.notice.length} notices`;
    lines.push(
      `::notice title=${escapeProperty("Vue Doctor")}::${escapeData(
        `${lines.length} findings (${counts}). GitHub shows at most ${GITHUB_ANNOTATION_LIMIT_PER_LEVEL} annotations per level per step; see the step log for all of them, or use --format sarif (code scanning) or --format json.`,
      )}`,
    );
  }
  return `${lines.join("\n")}\n`;
};
