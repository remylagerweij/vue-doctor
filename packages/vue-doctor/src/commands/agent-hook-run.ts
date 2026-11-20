import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { filterSourceFiles, getDiffInfo } from "../utils/get-diff-files.js";
import type { HookAgent } from "./agent-hooks.js";

/**
 * Runtime of the end-of-turn hooks (`vue-doctor agents hook <claude|cursor>`), which the agent
 * runs when it is about to finish a turn. Contract:
 * - Fast: only the files changed since HEAD are scanned, without dead-code analysis or network,
 *   and the scan is killed after SCAN_TIMEOUT_MS. No changed source files means no scan at all.
 * - Fail open: any problem (no git, scan failure, bad input, timeout) prints nothing and exits 0,
 *   so the hook can never trap the agent.
 * - Cannot loop: the agent's own loop flag (`stop_hook_active` for Claude Code, `loop_count` for
 *   Cursor) makes the hook stay silent, and the same set of findings is reported at most once
 *   per session, so an agent that stops again without fixing is not nagged.
 */

export const SCAN_TIMEOUT_MS = 45_000;
export const MAX_REPORTED_FINDINGS = 10;
const MAX_STDIN_BYTES = 1024 * 1024;
const SCAN_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
/** Set to `off` to disable the hooks without editing configuration files. */
export const DISABLE_ENV = "VUE_DOCTOR_AGENT_HOOK";

export interface HookInput {
  /** Claude Code */
  session_id?: string;
  cwd?: string;
  stop_hook_active?: boolean;
  /** Cursor */
  conversation_id?: string;
  workspace_roots?: string[];
  status?: string;
  loop_count?: number;
}

export interface HookFinding {
  ruleId: string;
  severity: string;
  file: string;
  line: number;
  message: string;
  fingerprint?: string;
}

export interface HookRunOptions {
  agent: HookAgent;
  input: HookInput;
  /** Directory fallback when the input names none. */
  cwd: string;
  /** Where "already reported" state lives. Defaults to the OS temp directory. */
  stateDirectory?: string;
  /** Runs the scan and returns the JSON report text, or null on failure. Injectable for tests. */
  runScan?: (directory: string) => string | null;
  env?: NodeJS.ProcessEnv;
}

/** What the hook prints to stdout (the agent reads it); `null` means print nothing. */
export const runAgentHook = (options: HookRunOptions): string | null => {
  try {
    const { agent, input } = options;
    if ((options.env ?? process.env)[DISABLE_ENV] === "off") return null;

    // The agent already continued once because of a hook: let it stop.
    if (agent === "claude" && input.stop_hook_active === true) return null;
    if (agent === "cursor" && ((input.loop_count ?? 0) >= 1 || (input.status !== undefined && input.status !== "completed"))) return null;

    const directory = path.resolve(
      agent === "cursor" ? (input.workspace_roots?.[0] ?? input.cwd ?? options.cwd) : (input.cwd ?? options.cwd),
    );

    // Uncommitted + untracked files only. Anything but a clean "ok" means there is nothing to check.
    const diff = getDiffInfo(directory, "HEAD");
    if (diff.status !== "ok" || filterSourceFiles(diff.changedFiles).length === 0) return null;

    const reportText = (options.runScan ?? runScanProcess)(directory);
    if (!reportText) return null;
    const findings = parseFindings(reportText);
    if (findings.length === 0) return null;

    const sessionId = input.session_id ?? input.conversation_id ?? "default";
    if (!recordIfNew(options.stateDirectory ?? os.tmpdir(), directory, sessionId, findings)) return null;

    const message = formatMessage(findings);
    return agent === "claude"
      ? JSON.stringify({ decision: "block", reason: message })
      : JSON.stringify({ followup_message: message });
  } catch {
    return null;
  }
};

/** Runs this same CLI on the changed files. Returns the JSON report, or null on timeout or failure. */
const runScanProcess = (directory: string): string | null => {
  const entry = process.argv[1];
  if (!entry) return null;
  const result = spawnSync(
    process.execPath,
    [
      entry,
      directory,
      "--diff",
      "HEAD",
      "--format",
      "json",
      "--no-timestamp",
      "--no-dead-code",
      "--offline",
      "--no-color",
      "--quiet",
      "--yes",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: SCAN_TIMEOUT_MS, maxBuffer: SCAN_MAX_BUFFER_BYTES },
  );
  if (result.error || typeof result.stdout !== "string" || result.stdout.length === 0) return null;
  return result.stdout;
};

const parseFindings = (reportText: string): HookFinding[] => {
  const report = JSON.parse(reportText) as { projects?: { findings?: HookFinding[] }[] };
  const all = (report.projects ?? []).flatMap((project) => project.findings ?? []);
  // Errors first, then the report's own order (file, line).
  return [...all.filter((finding) => finding.severity === "error"), ...all.filter((finding) => finding.severity !== "error")];
};

const findingKey = (finding: HookFinding): string =>
  finding.fingerprint ?? `${finding.ruleId}:${finding.file}:${finding.line}`;

/** Returns true (and remembers the set) when this session has not been told about exactly these findings yet. */
const recordIfNew = (stateDirectory: string, directory: string, sessionId: string, findings: HookFinding[]): boolean => {
  const digest = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
  const stateFile = path.join(stateDirectory, `vue-doctor-agent-hook-${digest(`${directory}\0${sessionId}`).slice(0, 16)}.json`);
  const current = digest(findings.map(findingKey).sort().join("\n"));
  try {
    if ((JSON.parse(fs.readFileSync(stateFile, "utf8")) as { reported?: string }).reported === current) return false;
  } catch {
    // First run for this session.
  }
  try {
    fs.writeFileSync(stateFile, JSON.stringify({ reported: current }), { encoding: "utf8", mode: 0o600 });
  } catch {
    // Without state the worst case is one repeated report; the agent loop flag still bounds it.
  }
  return true;
};

const formatMessage = (findings: HookFinding[]): string => {
  const shown = findings.slice(0, MAX_REPORTED_FINDINGS);
  const lines = shown.map((finding) => {
    const where = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
    return `- ${where} [${finding.severity}] ${finding.ruleId}: ${finding.message}`;
  });
  const more = findings.length > shown.length ? `\n...and ${findings.length - shown.length} more.` : "";
  return [
    `Vue Doctor found ${findings.length} issue${findings.length === 1 ? "" : "s"} in the files changed in this session:`,
    ...lines,
  ].join("\n") +
    `${more}\n` +
    "Fix the errors first (`npx @remylagerweij/vue-doctor explain <ruleId>` shows remediation guidance, `--fix` applies safe codemods). " +
    "If a finding is intentional, say so briefly and finish. This check reports a given set of findings only once.";
};

/** Reads stdin to the end (bounded); resolves to "" when stdin is a terminal or fails. */
export const readHookInput = async (stream: NodeJS.ReadStream = process.stdin): Promise<HookInput> => {
  if (stream.isTTY) return {};
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buffer.length;
      if (size > MAX_STDIN_BYTES) return {};
      chunks.push(buffer);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as HookInput) : {};
  } catch {
    return {};
  }
};
