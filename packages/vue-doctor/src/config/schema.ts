import { z } from "zod";

/**
 * Single source of truth for `vue-doctor.config.*`: the TypeScript types, runtime validation and the
 * published JSON Schema (`schema/vue-doctor.schema.json`) are all derived from these definitions.
 * Every object is strict, so typos such as `ignore.paths` are reported instead of silently ignored.
 */

export const PRESET_NAMES = [
  "vue-doctor/recommended",
  "vue-doctor/strict",
  "vue-doctor/security",
] as const;

const PR_FEEDBACK_MODES = ["summary", "annotations", "findings", "none"] as const;
const PR_GROUPINGS = ["finding", "rule-per-file", "rule"] as const;

const severitySchema = z
  .enum(["off", "warn", "warning", "error"])
  .describe('"off" disables the rule; "warn" is an alias of "warning".');

const ruleEntrySchema = z.union([
  severitySchema,
  z.tuple([severitySchema]),
  z.tuple([severitySchema, z.record(z.string(), z.unknown())]),
]);

const ignoreSchema = z
  .strictObject({
    files: z.array(z.string()).optional().describe("Glob patterns of files whose findings are dropped."),
    rules: z
      .array(z.string())
      .optional()
      .describe('Rule IDs (or groups like "vue-doctor/security/*") whose findings are dropped.'),
  })
  .describe("Findings to drop entirely. Prefer `rules` for severity changes.");

const gateSchema = z
  .strictObject({
    failOn: z.enum(["none", "error", "warning"]).optional(),
    scope: z.enum(["new", "all"]).optional(),
    minScore: z.number().int().min(0).max(100).nullable().optional(),
    strict: z.boolean().optional(),
  })
  .describe("Defaults for --fail-on, --gate, --min-score and --strict. CLI flags win.");

const auditSchema = z
  .strictObject({
    enabled: z.boolean().optional().describe("Query OSV.dev for vulnerable dependencies (network)."),
  })
  .describe("Dependency vulnerability audit. Off by default; never runs with --offline.");

const prSchema = z
  .strictObject({
    modes: z.array(z.enum(PR_FEEDBACK_MODES)).optional(),
    grouping: z.enum(PR_GROUPINGS).optional(),
    maxComments: z.number().int().min(0).optional(),
    agentPrompt: z.boolean().optional(),
  })
  .describe("Pull request feedback used by `vue-doctor ci report`.");

export const configSchema = z
  .strictObject({
    $schema: z.string().optional(),
    extends: z
      .array(z.enum(PRESET_NAMES))
      .optional()
      .describe("Presets applied before `rules`, in order."),
    rules: z
      .record(z.string(), ruleEntrySchema)
      .optional()
      .describe(
        'Per-rule severity, e.g. { "vue-doctor/performance/no-deep-watch": "off" }. Keys are rule IDs (`vue-doctor/<category>/<rule>`, `vue/<rule>`, `knip/<type>`) or groups (`vue-doctor/security/*`). The 1.x forms `no-deep-watch` and `vue-doctor/no-deep-watch` still work but are deprecated.',
      ),
    ignore: ignoreSchema.optional(),
    gate: gateSchema.optional(),
    audit: auditSchema.optional(),
    baseline: z.string().nullable().optional().describe("Path to a baseline file, relative to the project root."),
    pr: prSchema.optional(),
    lint: z.boolean().optional().describe("Run lint checks (oxlint + template checks). Default: true."),
    deadCode: z.boolean().optional().describe("Run dead code checks (knip). Default: true."),
    verbose: z.boolean().optional().describe("Show file details per rule. Default: false."),
    cache: z
      .boolean()
      .optional()
      .describe("Reuse findings for unchanged files (node_modules/.cache/vue-doctor). Default: true."),
    diff: z
      .union([z.boolean(), z.string()])
      .optional()
      .describe("Only scan changed files: true for auto-detection, or a base branch name."),
  })
  .describe("Vue Doctor configuration");

/** Configuration as written by users (`vue-doctor.config.*` or `package.json#vueDoctor`). */
export type VueDoctorConfig = z.input<typeof configSchema>;
export type VueDoctorIgnoreConfig = NonNullable<VueDoctorConfig["ignore"]>;
export type RuleSeverity = z.infer<typeof severitySchema>;
export type RuleEntry = z.infer<typeof ruleEntrySchema>;
export type PresetName = (typeof PRESET_NAMES)[number];

export const createJsonSchema = (): Record<string, unknown> => ({
  ...z.toJSONSchema(configSchema, { target: "draft-2020-12", io: "input" }),
  $id: "https://remylagerweij.github.io/vue-doctor/schema/vue-doctor.schema.json",
  title: "Vue Doctor configuration",
});
