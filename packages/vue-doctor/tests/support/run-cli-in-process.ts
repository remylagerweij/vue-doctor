import { vi } from "vitest";
import { configureLogger } from "../../src/utils/logger.js";
import { runCli } from "../../src/program.js";

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

export interface CliRun {
  /** Process exit code: `process.exit(code)` if the CLI called it, else `process.exitCode` (0 by default). */
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the CLI in this process (no spawn, so it shows up in coverage and is much faster than the
 * built `dist/cli.js`) and captures stdout/stderr without ANSI colours. `process.exit` is
 * intercepted: the first exit code wins and execution continues, which is what the CLI's own
 * `handleError` path expects (it is the last statement of every action).
 */
export const runCliInProcess = async (args: string[], env: Record<string, string> = {}): Promise<CliRun> => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitedWith: number | undefined;

  const previousEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries({ CI: "1", ...env })) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  configureLogger();

  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk).replace(ANSI_PATTERN, ""));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk).replace(ANSI_PATTERN, ""));
    return true;
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitedWith ??= code ?? 0;
  }) as never);

  try {
    await runCli(["node", "vue-doctor", ...args]);
    return {
      exitCode: exitedWith ?? Number(process.exitCode ?? 0),
      stdout: stdout.join(""),
      stderr: stderr.join(""),
    };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    process.exitCode = previousExitCode;
    configureLogger();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};
