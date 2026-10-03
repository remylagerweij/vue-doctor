import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ruleIdOf } from "../plugin/rule-ids.js";
import type { Diagnostic } from "../types.js";

const FINGERPRINT_LENGTH = 16;

/** Collapses whitespace so re-indenting or reformatting a line keeps its fingerprint. */
const normalizeSnippet = (text: string): string => text.replace(/\s+/g, " ").trim();

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, FINGERPRINT_LENGTH);

/** Canonical rule ID, so a fingerprint does not depend on how an analyzer spells the rule internally. */
const ruleKey = ruleIdOf;

/**
 * Adds a `fingerprint` to every finding: hash(rule + file + normalized source line + occurrence).
 *
 * Line and column are deliberately left out, so moving code within a file (or adding lines above
 * it) keeps the fingerprint stable. Identical findings on identical lines in one file are told
 * apart by their order of appearance. Findings without a source line (e.g. an unused file) use
 * their message as the snippet.
 */
export const addFingerprints = (diagnostics: Diagnostic[], rootDirectory: string): Diagnostic[] => {
  const linesByFile = new Map<string, string[] | null>();
  const readLines = (filePath: string): string[] | null => {
    if (!linesByFile.has(filePath)) {
      try {
        linesByFile.set(filePath, fs.readFileSync(path.resolve(rootDirectory, filePath), "utf-8").split(/\r?\n/));
      } catch {
        linesByFile.set(filePath, null);
      }
    }
    return linesByFile.get(filePath) ?? null;
  };

  const snippetOf = (diagnostic: Diagnostic): string => {
    const lines = diagnostic.line > 0 ? readLines(diagnostic.filePath) : null;
    const line = lines?.[diagnostic.line - 1];
    return line === undefined ? `message:${diagnostic.message}` : normalizeSnippet(line);
  };

  // Occurrence index in source order, so the same input always yields the same fingerprints.
  const order = diagnostics
    .map((diagnostic, index) => ({ diagnostic, index }))
    .sort(
      (left, right) =>
        left.diagnostic.filePath.localeCompare(right.diagnostic.filePath) ||
        left.diagnostic.line - right.diagnostic.line ||
        left.diagnostic.column - right.diagnostic.column ||
        left.index - right.index,
    );

  const occurrences = new Map<string, number>();
  const fingerprints: string[] = Array.from({ length: diagnostics.length }, () => "");
  for (const { diagnostic, index } of order) {
    const base = [ruleKey(diagnostic), diagnostic.filePath.replace(/\\/g, "/"), snippetOf(diagnostic)].join("\0");
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    fingerprints[index] = hash(`${base}\0${occurrence}`);
  }

  return diagnostics.map((diagnostic, index) => ({ ...diagnostic, fingerprint: fingerprints[index] }));
};
