import fs from "node:fs";
import path from "node:path";
import type { Failure, FuzzEngine, Oracle } from "./types.js";

/**
 * Failures the fuzzer found that are known and not fixed yet. The gate is green while every
 * failure is listed here, so the debt stays visible in a file instead of in someone's memory.
 * Fix the rule, then delete its entry (the run warns about entries that no longer match anything).
 */
export interface KnownFailure {
  oracle: Oracle;
  /** Flat rule id (`no-eval`, `vue/require-v-for-key`), `*` for any. */
  rule: string;
  engine?: FuzzEngine;
  /** A transform id (`crlf`, or `*+crlf` for compositions), `baseline`, or `mutation:<id>`. Omitted: any. */
  variant?: string;
  /** An input id, or a pattern with `*` wildcards (`case:no-eval:*`). Omitted: any. */
  input?: string;
  /** Why this is allowed for now: what is wrong and where it should be fixed. */
  reason: string;
}

export const KNOWN_FAILURES_PATH = path.join(import.meta.dirname, "known-failures.json");

const ORACLES: readonly string[] = ["crash", "slowness", "metamorphic"];
const ENGINES: readonly string[] = ["oxlint", "template", "fs"];

export const loadKnownFailures = (file = KNOWN_FAILURES_PATH): KnownFailure[] => {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { knownFailures?: unknown };
  if (!Array.isArray(parsed.knownFailures)) throw new Error(`${file}: "knownFailures" must be an array`);
  return parsed.knownFailures.map((entry: Record<string, unknown>, index) => {
    const where = `${file}: knownFailures[${index}]`;
    if (!ORACLES.includes(String(entry.oracle))) throw new Error(`${where}: oracle must be one of ${ORACLES.join(", ")}`);
    if (typeof entry.rule !== "string" || entry.rule === "") throw new Error(`${where}: rule is required (use "*" for any)`);
    if (entry.engine !== undefined && !ENGINES.includes(String(entry.engine))) throw new Error(`${where}: engine must be one of ${ENGINES.join(", ")}`);
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 10) throw new Error(`${where}: a reason of at least a sentence is required`);
    for (const key of ["variant", "input"] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== "string") throw new Error(`${where}: ${key} must be a string`);
    }
    return entry as unknown as KnownFailure;
  });
};

/** `*` matches any run of characters, anywhere in the pattern; no `*` means an exact match. */
const matchesPattern = (pattern: string | undefined, value: string): boolean => {
  if (pattern === undefined || pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === value;
  const source = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${source}$`, "s").test(value);
};

export const isKnown = (entry: KnownFailure, failure: Failure): boolean =>
  entry.oracle === failure.oracle &&
  (entry.engine === undefined || entry.engine === failure.engine) &&
  matchesPattern(entry.rule, failure.rule) &&
  matchesPattern(entry.variant, failure.variant) &&
  matchesPattern(entry.input, failure.input);

export interface TriagedFailures {
  /** Failures no entry covers: these fail the gate. */
  unexpected: Failure[];
  /** Failures an entry covers. */
  known: Failure[];
  /** Entries that matched nothing (only meaningful for a complete run). */
  stale: KnownFailure[];
}

export const triageFailures = (failures: readonly Failure[], knownFailures: readonly KnownFailure[]): TriagedFailures => {
  const used = new Set<KnownFailure>();
  const unexpected: Failure[] = [];
  const known: Failure[] = [];
  for (const failure of failures) {
    const entry = knownFailures.find((candidate) => isKnown(candidate, failure));
    if (entry) {
      used.add(entry);
      known.push(failure);
    } else {
      unexpected.push(failure);
    }
  }
  return { unexpected, known, stale: knownFailures.filter((entry) => !used.has(entry)) };
};
