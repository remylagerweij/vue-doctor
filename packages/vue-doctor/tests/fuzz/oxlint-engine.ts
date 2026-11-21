import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createOxlintConfig } from "../../src/plugin/registry.js";
import { resolvePluginPath } from "../../src/utils/run-oxlint.js";
import type { RuleTiming } from "./types.js";

const esmRequire = createRequire(import.meta.url);

const INSTRUMENT_PLUGIN_PATH = path.join(import.meta.dirname, "instrument-plugin.mjs");

export interface OxlintFile {
  filename: string;
  code: string;
}

export interface OxlintFinding {
  rule: string;
  line: number;
  message: string;
}

export interface OxlintFileResult {
  findings: OxlintFinding[];
  /** Diagnostics that are not a Vue Doctor rule's: a syntax error in the input, typically. */
  problems: string[];
  /**
   * Failures of oxlint's JS plugin host itself (the anonymous "Error running JS plugin."): in
   * production they drop every Vue Doctor finding for the file, so they count as a crash, not as
   * an input that does not parse.
   */
  hostErrors: string[];
  /** Per-rule time spent in this file, and the exception a rule threw, if any. */
  timings: RuleTiming[];
}

interface OxlintDiagnostic {
  message: string;
  code?: string;
  filename: string;
  labels?: { span: { line: number } }[];
}

const resolveOxlintBinary = (): string =>
  path.join(path.resolve(path.dirname(esmRequire.resolve("oxlint")), ".."), "bin", "oxlint");

export class OxlintTimeoutError extends Error {}

const spawnOxlint = (args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new OxlintTimeoutError(`oxlint did not finish within ${timeoutMs} ms`));
    }, timeoutMs);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const output = Buffer.concat(stdout).toString("utf8").trim();
      if (!output && stderr.length > 0) {
        reject(new Error(`oxlint failed: ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      resolve(output);
    });
  });

const HOST_ERROR_PATTERN = /^Error running JS plugin/;

const DIRECTORY_PATTERN = /^c(\d+)[\\/]/;

export interface OxlintRunOptions {
  /** Options of rules that take any (per rule id), for the whole run. */
  ruleOptions?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Enable only these rules (flat ids); default: every own rule, as on a Nuxt project. */
  onlyRules?: readonly string[];
  /** Kill oxlint after this long. */
  timeoutMs?: number;
  /** The plugin bundle to wrap (default: the production build in dist/). For testing the harness itself. */
  pluginPath?: string;
}

/**
 * Lints files with the production oxlint setup (every own rule enabled as on a Nuxt project, the
 * built plugin bundle) through the instrumented plugin wrapper, in ONE oxlint run. Each file gets
 * a numbered directory so its path keeps meaning (`server/api/x.ts`, `Foo.client.vue`). Results
 * are returned in input order. Needs `npm run build`.
 */
export const runOxlintInstrumented = async (
  files: readonly OxlintFile[],
  { ruleOptions, onlyRules, timeoutMs = 600_000, pluginPath = resolvePluginPath() }: OxlintRunOptions = {},
): Promise<OxlintFileResult[]> => {
  const results: OxlintFileResult[] = files.map(() => ({ findings: [], problems: [], hostErrors: [], timings: [] }));
  if (files.length === 0) return results;

  // The canonical path: oxlint reports files by their real path (macOS temp dirs are symlinks).
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-fuzz-")));
  try {
    files.forEach((file, index) => {
      const target = path.join(root, `c${index}`, file.filename);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.code);
    });
    const configPath = path.join(root, "oxlintrc.json");
    const logPath = path.join(root, "timings.jsonl");
    const config = createOxlintConfig({ pluginPath: INSTRUMENT_PLUGIN_PATH, framework: "nuxt", ruleOptions });
    if (onlyRules) {
      const wanted = new Set(onlyRules.map((rule) => `vue-doctor/${rule}`));
      config.rules = Object.fromEntries(Object.entries(config.rules).filter(([name]) => wanted.has(name)));
    }
    fs.writeFileSync(configPath, JSON.stringify(config));

    const stdout = await spawnOxlint(
      [resolveOxlintBinary(), "-c", configPath, "--format", "json", "--disable-nested-config", "."],
      root,
      { ...process.env, VDOC_FUZZ_PLUGIN: pluginPath, VDOC_FUZZ_LOG: logPath },
      timeoutMs,
    );
    const diagnostics: OxlintDiagnostic[] = stdout ? JSON.parse(stdout).diagnostics : [];

    for (const diagnostic of diagnostics) {
      const match = DIRECTORY_PATTERN.exec(diagnostic.filename.replace(/^\.[\\/]/, ""));
      if (!match) continue;
      const result = results[Number(match[1])];
      const ruleMatch = /^vue-doctor\((.+)\)$/.exec(diagnostic.code ?? "");
      if (ruleMatch) {
        result.findings.push({ rule: ruleMatch[1], line: diagnostic.labels?.[0]?.span.line ?? 0, message: diagnostic.message });
      } else if (HOST_ERROR_PATTERN.test(diagnostic.message)) {
        result.hostErrors.push(diagnostic.message.split("\n")[0]);
      } else {
        result.problems.push(`${diagnostic.code ?? "error"}: ${diagnostic.message.split("\n")[0]}`);
      }
    }

    if (fs.existsSync(logPath)) {
      for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
        if (!line) continue;
        const record = JSON.parse(line) as RuleTiming;
        const match = DIRECTORY_PATTERN.exec(path.relative(root, record.file));
        if (match) results[Number(match[1])].timings.push(record);
      }
    }
    return results;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
