import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ERROR_PREVIEW_LENGTH_CHARS,
  VUE_FILE_PATTERN,
  SPAWN_ARGS_MAX_LENGTH_CHARS,
} from "../constants.js";
import { createOxlintConfig, getRuleMeta, toDiagnosticRule } from "../plugin/registry.js";
import type { CleanedDiagnostic, Diagnostic, Framework, OxlintOutput } from "../types.js";
import { createDefusedMirror, findFilesWithForeignDirectives } from "./defuse-inline-directives.js";
import { normalizeRelativePath } from "./list-source-files.js";
import { createPrivateTempDirectory } from "./private-temp.js";
import { mapWithConcurrency } from "./map-with-concurrency.js";
import { resolveBatchConcurrency } from "./run-bounded.js";

const esmRequire = createRequire(import.meta.url);

const FILEPATH_WITH_LOCATION_PATTERN = /\S+\.\w+:\d+:\d+[\s\S]*$/;

const cleanDiagnosticMessage = (
  message: string,
  help: string,
  plugin: string,
  rule: string,
): CleanedDiagnostic => {
  const cleaned = message.replace(FILEPATH_WITH_LOCATION_PATTERN, "").trim();
  return { message: cleaned || message, help: help || getRuleMeta(plugin, rule)?.help || "" };
};

const parseRuleCode = (code: string): { plugin: string; rule: string } => {
  const match = code.match(/^(.+)\((.+)\)$/);
  if (!match) return { plugin: "unknown", rule: code };
  return { plugin: match[1].replace(/^eslint-plugin-/, ""), rule: match[2] };
};

const resolveOxlintBinary = (): string => {
  const oxlintMainPath = esmRequire.resolve("oxlint");
  const oxlintPackageDirectory = path.resolve(path.dirname(oxlintMainPath), "..");
  return path.join(oxlintPackageDirectory, "bin", "oxlint");
};

export const resolvePluginPath = (): string => {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const pluginPath = path.join(currentDirectory, "vue-doctor-plugin.js");
  if (fs.existsSync(pluginPath)) return pluginPath;

  const distPluginPath = path.resolve(currentDirectory, "../../dist/vue-doctor-plugin.js");
  if (fs.existsSync(distPluginPath)) return distPluginPath;

  return pluginPath;
};

const resolveDiagnosticCategory = (plugin: string, rule: string): string =>
  getRuleMeta(plugin, rule)?.category ?? "Other";

const estimateArgsLength = (args: string[]): number =>
  args.reduce((total, argument) => total + argument.length + 1, 0);

const batchIncludePaths = (baseArgs: string[], includePaths: string[]): string[][] => {
  const baseArgsLength = estimateArgsLength(baseArgs);
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentBatchLength = baseArgsLength;

  for (const filePath of includePaths) {
    const entryLength = filePath.length + 1;
    if (currentBatch.length > 0 && currentBatchLength + entryLength > SPAWN_ARGS_MAX_LENGTH_CHARS) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchLength = baseArgsLength;
    }
    currentBatch.push(filePath);
    currentBatchLength += entryLength;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

/** Called with the exact argv and cwd of every spawned process (for `--debug`). */
export type CommandListener = (argv: string[], cwd: string) => void;

const spawnOxlint = (
  args: string[],
  rootDirectory: string,
  nodeBinaryPath: string,
  onCommand?: CommandListener,
): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    onCommand?.([nodeBinaryPath, ...args], rootDirectory);
    const child = spawn(nodeBinaryPath, args, {
      cwd: rootDirectory,
    });

    const stdoutBuffers: Buffer[] = [];
    const stderrBuffers: Buffer[] = [];

    child.stdout.on("data", (buffer: Buffer) => stdoutBuffers.push(buffer));
    child.stderr.on("data", (buffer: Buffer) => stderrBuffers.push(buffer));

    child.on("error", (error) => reject(new Error(`Failed to run oxlint: ${error.message}`)));
    child.on("close", () => {
      const output = Buffer.concat(stdoutBuffers).toString("utf-8").trim();
      if (!output) {
        const stderrOutput = Buffer.concat(stderrBuffers).toString("utf-8").trim();
        if (stderrOutput) {
          reject(new Error(`Failed to run oxlint: ${stderrOutput}`));
          return;
        }
      }
      resolve(output);
    });
  });

const parseOxlintOutput = (stdout: string): Diagnostic[] => {
  if (!stdout) return [];

  let output: OxlintOutput;
  try {
    output = JSON.parse(stdout) as OxlintOutput;
  } catch {
    throw new Error(
      `Failed to parse oxlint output: ${stdout.slice(0, ERROR_PREVIEW_LENGTH_CHARS)}`,
    );
  }

  return output.diagnostics
    .filter((diagnostic) => diagnostic.code && VUE_FILE_PATTERN.test(diagnostic.filename))
    .map((diagnostic) => {
      const { plugin, rule } = parseRuleCode(diagnostic.code);
      const primaryLabel = diagnostic.labels[0];

      const cleaned = cleanDiagnosticMessage(diagnostic.message, diagnostic.help, plugin, rule);
      const meta = getRuleMeta(plugin, rule);

      return {
        filePath: diagnostic.filename,
        plugin,
        // Own rules are reported by canonical ID (`vue-doctor/<category>/<rule>`), not oxlint's flat name.
        rule: meta ? toDiagnosticRule(meta) : rule,
        severity: diagnostic.severity,
        message: cleaned.message,
        help: cleaned.help,
        line: primaryLabel?.span.line ?? 0,
        column: primaryLabel?.span.column ?? 0,
        category: resolveDiagnosticCategory(plugin, rule),
      };
    });
};

export const runOxlint = async (
  rootDirectory: string,
  hasTypeScript: boolean,
  framework: Framework,
  includePaths?: string[],
  nodeBinaryPath: string = process.execPath,
  onCommand?: CommandListener,
): Promise<Diagnostic[]> => {
  if (includePaths !== undefined && includePaths.length === 0) {
    return [];
  }

  const pluginPath = resolvePluginPath();
  const config = createOxlintConfig({ pluginPath, framework });
  const configDirectory = createPrivateTempDirectory("oxlintrc");
  let mirror: ReturnType<typeof createDefusedMirror> | undefined;

  try {
    const configPath = configDirectory.writeFile(
      "oxlintrc.json",
      JSON.stringify(config, null, 2),
    );

    const oxlintBinary = resolveOxlintBinary();
    const baseArgs = [oxlintBinary, "-c", configPath, "--format", "json"];

    if (hasTypeScript) {
      baseArgs.push("--tsconfig", "./tsconfig.json");
    }

    const batchConcurrency = resolveBatchConcurrency();
    // Batches are independent oxlint processes; results are concatenated in batch order so the
    // output does not depend on which process finishes first.
    const runBatches = async (
      args: string[],
      paths: string[],
      workingDirectory: string,
    ): Promise<Diagnostic[]> => {
      const batchDiagnostics = await mapWithConcurrency(
        batchIncludePaths(args, paths),
        batchConcurrency,
        async (batch) =>
          parseOxlintOutput(
            await spawnOxlint([...args, ...batch], workingDirectory, nodeBinaryPath, onCommand),
          ),
      );
      return batchDiagnostics.flat();
    };

    const projectDiagnostics = await runBatches(
      baseArgs,
      includePaths !== undefined ? includePaths : ["."],
      rootDirectory,
    );

    // oxlint honours inline eslint-disable/oxlint-disable comments and has no option to turn that
    // off. Those comments must not hide Vue Doctor findings, so files that contain them are linted
    // again from a defused copy in the OS temp directory; project files are never modified.
    const defusedFiles = findFilesWithForeignDirectives(rootDirectory, includePaths);
    if (defusedFiles.length === 0) return projectDiagnostics;

    mirror = createDefusedMirror(defusedFiles);
    const defusedPaths = new Set(mirror.relativePaths);
    const mirrorArgs = hasTypeScript
      ? [...baseArgs.slice(0, -1), path.join(rootDirectory, "tsconfig.json")]
      : baseArgs;
    const mirrorDiagnostics = await runBatches(mirrorArgs, mirror.relativePaths, mirror.directory);

    return [
      ...projectDiagnostics.filter(
        (diagnostic) => !defusedPaths.has(normalizeRelativePath(diagnostic.filePath)),
      ),
      ...mirrorDiagnostics,
    ];
  } finally {
    mirror?.dispose();
    configDirectory.dispose();
  }
};
