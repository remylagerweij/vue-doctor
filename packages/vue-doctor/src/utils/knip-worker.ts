// Entry of the child process that runs knip (spawned by run-knip.ts; shipped as dist/knip-worker.js).
// Knip's config loading executes project code (vite.config, dotenv, ...) that writes through console.
// Replacing the global console in the host would break concurrent analyzers and host applications, so
// knip runs here, where the console is ours alone and can be silenced. The result is one JSON document
// on stdout, so nothing else may write to it.
import { createOptions, createSession } from "knip/session";
import { KNIP_ISSUE_TYPES, type KnipWorkerIssue, type KnipWorkerResult } from "./run-knip.js";

const silenceConsole = (): void => {
  const noop = (): void => {};
  for (const method of ["log", "info", "warn", "error", "debug"] as const) console[method] = noop;
};

const writeResult = (result: KnipWorkerResult): Promise<void> =>
  new Promise((resolve) => process.stdout.write(JSON.stringify(result), () => resolve()));

const run = async (cwd: string, workspaceName: string): Promise<KnipWorkerResult> => {
  const options = await createOptions({
    cwd,
    isSession: true,
    isUseTscFiles: false,
    isShowProgress: false,
    ...(workspaceName ? { workspace: workspaceName } : {}),
  });
  const { issues } = (await createSession(options)).getResults();
  // Only what the host needs crosses the process boundary (knip's issue objects carry fixes, positions, ...).
  const found: KnipWorkerIssue[] = [];
  for (const type of KNIP_ISSUE_TYPES) {
    for (const issuesByName of Object.values(issues[type])) {
      for (const issue of Object.values(issuesByName)) {
        found.push({ type, filePath: issue.filePath, symbol: issue.symbol });
      }
    }
  }
  return { ok: true, issues: found };
};

const [cwd = "", workspaceName = ""] = process.argv.slice(2);
silenceConsole();

try {
  await writeResult(await run(cwd, workspaceName));
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeResult({ ok: false, error: message });
}
process.exit(0);
