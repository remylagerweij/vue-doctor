import { EventEmitter } from "node:events";
import { vi } from "vitest";

export interface FakeProcessBehavior {
  stdout?: string;
  stderr?: string;
  /** Emit an `error` event (e.g. ENOENT) instead of running. */
  error?: Error;
}

/**
 * A stand-in for `child_process.spawn` that replays canned output. Use it with `vi.mock` to test how
 * the runners handle tool output (invalid JSON, stderr-only failures, spawn errors) without
 * depending on what the real tools would print.
 */
export const createFakeSpawn = (behavior: () => FakeProcessBehavior) =>
  vi.fn((_command: string, _args: readonly string[], _options?: unknown) => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const { stdout, stderr, error } = behavior();
    setImmediate(() => {
      if (error) {
        child.emit("error", error);
        return;
      }
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", 0);
    });
    return child;
  });
