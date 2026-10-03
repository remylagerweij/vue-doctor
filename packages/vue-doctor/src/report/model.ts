import { z } from "zod";

/**
 * Single source of truth for the machine-readable report (`vue-doctor/report@2`): the TypeScript
 * types, runtime validation and the published JSON Schema (`schema/report.schema.json`) are all
 * derived from these definitions. Objects are deliberately not strict: minor releases may add
 * fields without bumping the format, so consumers must ignore fields they do not know.
 */

import { REPORT_FORMAT, REPORT_SCHEMA_URL } from "./constants.js";

export { REPORT_FORMAT, REPORT_SCHEMA_URL };

const severitySchema = z.enum(["error", "warning"]);

const findingSchema = z
  .object({
    ruleId: z.string().describe('Rule identifier, e.g. "vue-doctor/security/no-unsafe-html-sink" or "vue/require-v-for-key".'),
    category: z.string().describe('Rule category, e.g. "Security" or "Dead Code".'),
    severity: severitySchema,
    confidence: z.enum(["high", "medium", "low"]).describe("How likely the finding is a true positive."),
    cwe: z.array(z.string()).optional().describe('CWE identifiers, e.g. ["CWE-79"].'),
    owasp: z.string().optional().describe('OWASP Top 10 category, e.g. "A03:2021".'),
    file: z.string().describe("Project-relative path with forward slashes."),
    line: z.number().int().min(0).describe("1-based line; 0 when the finding is about the whole file."),
    column: z.number().int().min(0).describe("1-based column; 0 when unknown."),
    endLine: z.number().int().min(0).optional(),
    endColumn: z.number().int().min(0).optional(),
    message: z.string(),
    help: z.string().describe("Short remediation hint."),
    docsUrl: z.string().describe("Documentation page of the rule."),
    codeFrame: z
      .string()
      .optional()
      .describe("A few numbered source lines around the finding; the finding's line is marked with `>`. Omitted for findings that expose a credential."),
    fingerprint: z
      .string()
      .optional()
      .describe("Stable ID that survives code moving within a file; used by baselines."),
    status: z
      .enum(["new", "existing", "baseline"])
      .optional()
      .describe("Present when a reference point (baseline file or base branch) exists."),
    fixable: z.boolean().describe("Whether the rule has an automatic fix."),
    suggestion: z
      .object({ kind: z.literal("text"), text: z.string() })
      .optional()
      .describe("Concrete fix suggestion, for rules that provide one."),
    agentPrompt: z.string().describe("Self-contained prompt for an AI coding agent to fix this finding."),
  })
  .describe("One finding.");

const ruleGroupSchema = z
  .object({
    ruleId: z.string(),
    count: z.number().int().min(2).describe("Number of findings of the rule in this project."),
    agentPrompt: z
      .string()
      .describe("One prompt for an AI coding agent to fix all findings of the rule; lists at most 10 locations."),
  })
  .describe("Findings of one rule, for fixing them together.");

const scoreSchema = z
  .object({
    value: z.number().int().min(0).max(100).describe("Overall score after caps; what `--min-score` compares."),
    label: z.string(),
    rawScore: z.number().int().min(0).max(100).describe("Score before the security caps."),
    cap: z
      .object({
        value: z.number().int().min(0).max(100),
        reason: z.enum(["security-error", "critical-secret"]),
        ruleId: z.string().describe("A rule whose finding triggers the cap."),
      })
      .nullable()
      .describe("The cap that lowered the score; null when none applied."),
    categories: z
      .array(
        z.object({
          category: z.string(),
          score: z.number().int().min(0).max(100),
          label: z.string(),
          errors: z.number().int().min(0),
          warnings: z.number().int().min(0),
        }),
      )
      .describe("Sub-scores of the categories that have findings, worst first (same penalty model, never capped)."),
    impact: z
      .array(z.object({ ruleId: z.string(), gain: z.number().int().min(1) }))
      .describe("Overall score gain from fixing every finding of the rule, largest first."),
  })
  .describe("Overall score, sub-scores, caps and per-rule impact; see scoreVersion for the formula.");

const projectSchema = z
  .object({
    name: z.string(),
    root: z.string().describe("Project directory relative to the scanned directory (the directory argument), with forward slashes; `.` for the project at that directory."),
    framework: z.string().describe('"nuxt", "vite", "quasar", "vuecli" or "unknown".'),
    vueVersion: z.string().nullable(),
    typescript: z.boolean(),
    sourceFiles: z.number().int().min(0),
    scope: z
      .object({
        mode: z.enum(["full", "changed"]).describe('"changed" when only changed files (--diff) were scanned.'),
        files: z.number().int().min(0).optional().describe("Number of scanned files in `changed` mode."),
      })
      .describe("What was scanned."),
    score: scoreSchema,
    categories: z
      .record(z.string(), z.object({ errors: z.number().int().min(0), warnings: z.number().int().min(0) }))
      .describe("Finding counts per category (only categories with findings)."),
    summary: z.object({
      errors: z.number().int().min(0),
      warnings: z.number().int().min(0),
      suppressed: z.number().int().min(0),
    }),
    findings: z.array(findingSchema).describe("Ordered by file, line, column, ruleId."),
    ruleGroups: z
      .array(ruleGroupSchema)
      .describe("Rules with at least two findings, most findings first (then by rule ID)."),
    skipped: z
      .array(z.object({ tool: z.string(), reason: z.string() }))
      .describe("Analyzers that did not run; the score is incomplete when this is not empty."),
    timings: z
      .record(z.string(), z.number())
      .optional()
      .describe("Milliseconds per analyzer plus `total`. Omitted with --no-timestamp."),
    suppressed: z.object({
      count: z.number().int().min(0),
      byRule: z.record(z.string(), z.number().int().min(0)),
    }),
    baseline: z
      .object({
        path: z.string().describe("Baseline file, relative to the project root when inside it."),
        matched: z.number().int().min(0),
        new: z.number().int().min(0),
        fixed: z.number().int().min(0).nullable().describe("`null` in diff mode."),
      })
      .optional()
      .describe("Present when a baseline was applied."),
    offline: z.boolean(),
  })
  .describe("Result for one project.");

const scoreVersionSchema = z.number().int().min(1).describe("Version of the score formula (docs: guide/scoring).");

const toolSchema = z.object({ name: z.literal("vue-doctor"), version: z.string() });

const summarySchema = z.object({
  projects: z.number().int().min(0),
  errors: z.number().int().min(0),
  warnings: z.number().int().min(0),
});

export const reportSchema = z
  .object({
    $schema: z.string().optional(),
    format: z.literal(REPORT_FORMAT),
    scoreVersion: scoreVersionSchema,
    tool: toolSchema,
    generatedAt: z.string().optional().describe("ISO 8601 timestamp. Omitted with --no-timestamp."),
    summary: summarySchema,
    projects: z.array(projectSchema).describe("Ordered by project name."),
  })
  .describe("Vue Doctor report");

/** `--format jsonl`: one of these per line, a `summary` as the last line. */
export const jsonlFindingSchema = findingSchema.extend({
  type: z.literal("finding"),
  project: z.string().describe("Name of the project the finding belongs to."),
});

export const jsonlSummarySchema = z.object({
  type: z.literal("summary"),
  format: z.literal(REPORT_FORMAT),
  scoreVersion: scoreVersionSchema,
  tool: toolSchema,
  generatedAt: z.string().optional(),
  summary: summarySchema,
  projects: z.array(projectSchema.omit({ findings: true, ruleGroups: true })),
});

export type Report = z.infer<typeof reportSchema>;
export type ReportProject = z.infer<typeof projectSchema>;
export type ReportFinding = z.infer<typeof findingSchema>;
export type JsonlFinding = z.infer<typeof jsonlFindingSchema>;
export type JsonlSummary = z.infer<typeof jsonlSummarySchema>;

export const createReportJsonSchema = (): Record<string, unknown> => ({
  ...z.toJSONSchema(reportSchema, { target: "draft-2020-12", io: "input" }),
  $id: REPORT_SCHEMA_URL,
  title: "Vue Doctor report (vue-doctor/report@2)",
});
