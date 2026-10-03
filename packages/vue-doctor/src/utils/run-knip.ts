import { spawn } from "node:child_process";
import type { CommandListener } from "./run-oxlint.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostic } from "../types.js";
import { listNestedWorkspaceDirectories, listWorkspaceDirectories, listWorkspacePackages } from "./discover-project.js";
import { findMonorepoRoot, isMonorepoRoot } from "./find-monorepo-root.js";

// Knip issue types vue-doctor reports; the rest (dependencies, unlisted, ...) belongs to other tools.
export const KNIP_ISSUE_TYPES = ["files", "exports", "types", "duplicates"] as const;

type KnipIssueType = (typeof KNIP_ISSUE_TYPES)[number];

export interface KnipWorkerIssue {
  type: KnipIssueType;
  filePath: string;
  symbol: string;
}

const KNIP_MESSAGE_MAP: Record<KnipIssueType, string> = {
  files: "Unused file",
  exports: "Unused export",
  types: "Unused type",
  duplicates: "Duplicate export",
};

const toPosixRelative = (rootDirectory: string, filePath: string): string =>
  path.relative(rootDirectory, filePath).split(path.sep).join("/");

const toDiagnostic = (issue: KnipWorkerIssue, rootDirectory: string): Diagnostic => ({
  filePath: toPosixRelative(rootDirectory, issue.filePath),
  plugin: "knip",
  rule: issue.type,
  severity: "warning",
  message:
    issue.type === "files" ? KNIP_MESSAGE_MAP.files : `${KNIP_MESSAGE_MAP[issue.type]}: ${issue.symbol}`,
  help: issue.type === "files" ? "This file is not imported by any other file in the project." : "",
  line: 0,
  column: 0,
  category: "Dead Code",
  weight: 1,
});

// Knip runs in a child process (see knip-worker.ts for why). The worker is a real file shipped in
// dist next to this module's chunk; when running from source (tests), fall back to the built one.
const resolveWorkerPath = (): string => {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const workerPath = path.join(currentDirectory, "knip-worker.js");
  if (fs.existsSync(workerPath)) return workerPath;

  const distWorkerPath = path.resolve(currentDirectory, "../../dist/knip-worker.js");
  return fs.existsSync(distWorkerPath) ? distWorkerPath : workerPath;
};

export type KnipWorkerResult =
  | { ok: true; issues: KnipWorkerIssue[] }
  | { ok: false; error: string };

const runKnipWorker = (
  knipCwd: string,
  workspaceName?: string,
  onCommand?: CommandListener,
): Promise<KnipWorkerIssue[]> =>
  new Promise<KnipWorkerIssue[]>((resolve, reject) => {
    const argv = [resolveWorkerPath(), knipCwd, workspaceName ?? ""];
    onCommand?.([process.execPath, ...argv], knipCwd);
    const child = spawn(process.execPath, argv, {
      cwd: knipCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutBuffers: Buffer[] = [];
    const stderrBuffers: Buffer[] = [];
    child.stdout.on("data", (buffer: Buffer) => stdoutBuffers.push(buffer));
    child.stderr.on("data", (buffer: Buffer) => stderrBuffers.push(buffer));

    child.on("error", (error) => reject(new Error(`Failed to run knip: ${error.message}`)));
    child.on("close", () => {
      const stdout = Buffer.concat(stdoutBuffers).toString("utf-8");
      try {
        const result = JSON.parse(stdout) as KnipWorkerResult;
        if (result.ok) resolve(result.issues);
        else reject(new Error(result.error));
      } catch {
        const stderr = Buffer.concat(stderrBuffers).toString("utf-8").trim();
        reject(new Error(`Failed to run knip: ${stderr || stdout.slice(0, 500)}`));
      }
    });
  });

/**
 * Shares one knip run between the projects of a monorepo: knip analyses every workspace in a single
 * pass, so scanning N projects must not cost N passes. The first project that needs dead-code results
 * starts the run at the monorepo root; the others await the same promise and take their own findings
 * from it (see `runKnip`). Create one per scan run: it caches results, so reusing it after files
 * changed would return stale findings.
 */
export interface KnipSession {
  /** Issues of the whole monorepo at `monorepoRoot`; knip runs once per root, however often this is called. */
  analyzeMonorepo: (monorepoRoot: string, onCommand?: CommandListener) => Promise<KnipWorkerIssue[]>;
}

export const createKnipSession = (): KnipSession => {
  const runs = new Map<string, Promise<KnipWorkerIssue[]>>();
  return {
    analyzeMonorepo: (monorepoRoot, onCommand) => {
      const key = path.resolve(monorepoRoot);
      let run = runs.get(key);
      if (!run) {
        run = runKnipWorker(key, undefined, onCommand);
        runs.set(key, run);
      }
      return run;
    },
  };
};

const isInsideDirectory = (directory: string, filePath: string): boolean => {
  const relative = path.relative(directory, filePath);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/**
 * Keeps the issues that belong to `projectDirectory`: files inside it that are not inside a nested
 * project (`projectDirectories`; those are findings of that project's own scan).
 */
const selectOwnIssues = (
  issues: KnipWorkerIssue[],
  projectDirectory: string,
  projectDirectories: string[],
): KnipWorkerIssue[] => {
  const deeperWorkspaces = projectDirectories.filter((workspace) => isInsideDirectory(projectDirectory, workspace));
  return issues.filter(
    (issue) =>
      isInsideDirectory(projectDirectory, issue.filePath) &&
      !deeperWorkspaces.some((workspace) => isInsideDirectory(workspace, issue.filePath)),
  );
};

/**
 * Dead-code findings of one project, relative to it. In a monorepo knip analyses all workspaces at
 * the root and the findings are split by owning project (by file path), so a workspace never gets
 * the findings of another and a root project never those of its nested workspaces.
 *
 * With a `session`, the monorepo is analysed once for all projects of the scan; without one, a
 * workspace is analysed on its own (knip's workspace filter), which is cheaper for a single project.
 */
export const runKnip = async (
  projectDirectory: string,
  onCommand?: CommandListener,
  session?: KnipSession,
): Promise<Diagnostic[]> => {
  const directory = path.resolve(projectDirectory);
  const toDiagnostics = (issues: KnipWorkerIssue[]): Diagnostic[] =>
    issues.map((issue) => toDiagnostic(issue, directory));

  // The project is the monorepo root itself: nested workspaces are other projects.
  if (isMonorepoRoot(directory)) {
    const issues = session
      ? await session.analyzeMonorepo(directory, onCommand)
      : await runKnipWorker(directory, undefined, onCommand);
    return toDiagnostics(selectOwnIssues(issues, directory, listNestedWorkspaceDirectories(directory)));
  }

  const monorepoRoot = findMonorepoRoot(directory);
  const workspaces = monorepoRoot ? listWorkspaceDirectories(monorepoRoot) : [];
  // Not a workspace of the monorepo above it (e.g. a fixture inside a repository): knip runs on it alone.
  if (!monorepoRoot || !workspaces.includes(directory)) {
    return toDiagnostics(await runKnipWorker(directory, undefined, onCommand));
  }

  try {
    let issues: KnipWorkerIssue[];
    if (session) {
      issues = await session.analyzeMonorepo(monorepoRoot, onCommand);
    } else {
      const packageJsonPath = path.join(directory, "package.json");
      const packageJson = fs.existsSync(packageJsonPath) ? JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) : {};
      issues = await runKnipWorker(monorepoRoot, packageJson.name ?? path.basename(directory), onCommand);
    }
    const projects = listWorkspacePackages(monorepoRoot).map((workspace) => workspace.directory);
    return toDiagnostics(selectOwnIssues(issues, directory, projects));
  } catch {
    return toDiagnostics(await runKnipWorker(directory, undefined, onCommand));
  }
};
