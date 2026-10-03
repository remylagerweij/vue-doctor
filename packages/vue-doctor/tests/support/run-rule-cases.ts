import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOxlintConfig } from "../../src/plugin/registry.js";
import { resolvePluginPath } from "../../src/utils/run-oxlint.js";

const esmRequire = createRequire(import.meta.url);

export const DEFAULT_CASE_FILENAME = "src/example.ts";

export interface SourceFile {
  /** Path relative to the (temporary) project root. */
  filename: string;
  code: string;
}

export interface RuleFinding {
  /** Rule id without the plugin prefix, e.g. `no-eval`. */
  rule: string;
  line: number;
  message: string;
}

export interface FileResult {
  findings: RuleFinding[];
  /** Diagnostics that do not come from a Vue Doctor rule, typically parse errors in the snippet. */
  problems: string[];
}

interface OxlintDiagnostic {
  message: string;
  code?: string;
  filename: string;
  labels?: { span: { line: number } }[];
}

const resolveOxlintBinary = (): string => {
  const oxlintMainPath = esmRequire.resolve("oxlint");
  return path.join(path.resolve(path.dirname(oxlintMainPath), ".."), "bin", "oxlint");
};

const spawnOxlint = (args: string[], cwd: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", () => {
      const output = Buffer.concat(stdout).toString("utf8").trim();
      if (!output && stderr.length > 0) {
        reject(new Error(`oxlint failed: ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      resolve(output);
    });
  });

/**
 * Lints many source files with the real production setup (oxlint, the built JS plugin and the
 * production rule config) in ONE oxlint invocation. Each file is written to its own numbered
 * directory so that `filename` keeps its path semantics (`server/api/x.ts`, `Foo.client.vue`)
 * without cases influencing each other. Results are returned in input order.
 *
 * Requires `npm run build` (the plugin is loaded from dist/, exactly as `vue-doctor` does).
 */
export const runOxlintOnFiles = async (files: SourceFile[]): Promise<FileResult[]> => {
  const pluginPath = resolvePluginPath();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-cases-"));
  try {
    files.forEach((file, index) => {
      const target = path.join(root, `c${index}`, file.filename);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.code);
    });
    const configPath = path.join(root, "oxlintrc.json");
    // `nuxt` enables every rule, including the Nuxt-only ones.
    fs.writeFileSync(configPath, JSON.stringify(createOxlintConfig({ pluginPath, framework: "nuxt" })));

    const stdout = await spawnOxlint(
      [resolveOxlintBinary(), "-c", configPath, "--format", "json", "--disable-nested-config", "."],
      root,
    );
    const diagnostics: OxlintDiagnostic[] = stdout ? JSON.parse(stdout).diagnostics : [];

    const results: FileResult[] = files.map(() => ({ findings: [], problems: [] }));
    for (const diagnostic of diagnostics) {
      const match = /^c(\d+)[\\/]/.exec(diagnostic.filename.replace(/^\.[\\/]/, ""));
      if (!match) continue;
      const result = results[Number(match[1])];
      const ruleMatch = /^vue-doctor\((.+)\)$/.exec(diagnostic.code ?? "");
      if (ruleMatch) {
        result.findings.push({
          rule: ruleMatch[1],
          line: diagnostic.labels?.[0]?.span.line ?? 0,
          message: diagnostic.message,
        });
      } else {
        result.problems.push(`${diagnostic.code ?? "error"}: ${diagnostic.message}`);
      }
    }
    return results;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
