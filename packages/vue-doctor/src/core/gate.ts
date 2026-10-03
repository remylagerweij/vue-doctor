import type { Diagnostic } from "../types.js";
import type { DiagnoseResult } from "./diagnose.js";

/** Process exit codes of the CLI. Stable public contract (documented in the CLI reference). */
export const EXIT_CODES = {
  /** Scan completed and no gate was breached. */
  ok: 0,
  /** Scan completed and a gate was breached (`--fail-on`, `--min-score`). */
  gateBreached: 1,
  /** Vue Doctor could not run: invalid usage or config, no Vue project, cancelled prompt, crash. */
  usageError: 2,
  /** An analyzer failed or was skipped and `--strict` was set. */
  analyzerFailure: 3,
} as const;

type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export type FailOn = "none" | "error" | "warning";
export type GateScope = "new" | "all";

export interface GateOptions {
  /** Lowest severity that fails the run. Default: "none". */
  failOn?: FailOn;
  /** Which findings count: only new ones (vs. baseline/base branch) or all. Default: "all". */
  gate?: GateScope;
  /** Fail when a project's overall score (after the security caps, see utils/calculate-score.ts) is below this value. */
  minScore?: number;
  /** Fail (exit 3) when any analyzer was skipped. */
  strict?: boolean;
}

export interface GateOutcome {
  exitCode: ExitCode;
  /** Human-readable reasons, one per breached gate. Empty when the gate passed. */
  reasons: string[];
}

export const FAIL_ON_VALUES: readonly FailOn[] = ["none", "error", "warning"];
export const GATE_SCOPE_VALUES: readonly GateScope[] = ["new", "all"];

/**
 * A finding is "new" unless something marked it as already known (a baseline file or the base
 * branch scan). Without any reference point every finding is new.
 */
const isNewFinding = (diagnostic: Diagnostic): boolean =>
  diagnostic.status === undefined || diagnostic.status === "new";

const countFailing = (diagnostics: Diagnostic[], failOn: FailOn, gate: GateScope) => {
  if (failOn === "none") return 0;
  return diagnostics.filter((diagnostic) => {
    if (gate === "new" && !isNewFinding(diagnostic)) return false;
    return failOn === "warning" || diagnostic.severity === "error";
  }).length;
};

const pluralize = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

export const evaluateGate = (results: DiagnoseResult[], options: GateOptions = {}): GateOutcome => {
  const failOn = options.failOn ?? "none";
  const gate = options.gate ?? "all";
  const reasons: string[] = [];

  if (options.strict) {
    const skipped = results.flatMap((result) =>
      result.skipped.map((entry) => `${result.project.projectName}: ${entry.analyzer} (${entry.reason})`),
    );
    if (skipped.length > 0) {
      return {
        exitCode: EXIT_CODES.analyzerFailure,
        reasons: [`--strict: ${pluralize(skipped.length, "analyzer")} did not run: ${skipped.join("; ")}`],
      };
    }
  }

  for (const result of results) {
    const failing = countFailing(result.diagnostics, failOn, gate);
    if (failing > 0) {
      const severityLabel = failOn === "error" ? "error" : "error/warning";
      const scopeLabel = gate === "new" ? "new " : "";
      reasons.push(
        `${result.project.projectName}: ${pluralize(failing, `${scopeLabel}${severityLabel} finding`)} (--fail-on ${failOn}${gate === "new" ? ", --gate new" : ""})`,
      );
    }
    if (options.minScore !== undefined && result.score < options.minScore) {
      reasons.push(`${result.project.projectName}: score ${result.score} is below --min-score ${options.minScore}`);
    }
  }

  return {
    exitCode: reasons.length > 0 ? EXIT_CODES.gateBreached : EXIT_CODES.ok,
    reasons,
  };
};
