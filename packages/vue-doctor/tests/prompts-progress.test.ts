import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_CODES } from "../src/core/gate.js";
import type { ProgressEvent } from "../src/core/diagnose.js";
import { configureLogger } from "../src/utils/logger.js";
import { createProgressReporter, type ProgressSpinner } from "../src/utils/progress.js";
import { exitOnCancel, promptMultiselect } from "../src/utils/prompts.js";

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[\d+m/g;
const CANCEL = Symbol("cancel");
const clackMock = vi.hoisted(() => ({ multiselect: vi.fn() }));

vi.mock("@clack/prompts", () => ({
  multiselect: clackMock.multiselect,
  isCancel: (value: unknown) => typeof value === "symbol",
}));

const LABELS = { lint: "lint checks", template: "template checks", "dead-code": "dead code checks", project: "project checks", audit: "dependency audit" };

const captureStderr = (): string[] => {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk).replace(ANSI_PATTERN, ""));
    return true;
  });
  return chunks;
};

const mockExit = () =>
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);

afterEach(() => {
  configureLogger();
  vi.restoreAllMocks();
  clackMock.multiselect.mockReset();
});

describe("prompt cancellation", () => {
  it("exits with the usage error code when the prompt is cancelled", () => {
    const exit = mockExit();
    captureStderr();
    expect(() => exitOnCancel(CANCEL, (value) => value === CANCEL)).toThrow(
      `exit:${EXIT_CODES.usageError}`,
    );
    expect(exit).toHaveBeenCalledWith(2);
  });

  it("returns the answer untouched when the prompt was answered", () => {
    expect(exitOnCancel(["a"], () => false)).toEqual(["a"]);
  });

  it("exits 2 when the project multiselect is cancelled", async () => {
    mockExit();
    captureStderr();
    clackMock.multiselect.mockResolvedValue(CANCEL);
    await expect(promptMultiselect("Pick", [{ label: "a", value: "/a" }])).rejects.toThrow("exit:2");
  });

  it("preselects every choice and draws on stderr", async () => {
    clackMock.multiselect.mockResolvedValue(["/a"]);
    const selected = await promptMultiselect("Pick", [
      { label: "a", value: "/a" },
      { label: "b", value: "/b" },
    ]);
    expect(selected).toEqual(["/a"]);
    expect(clackMock.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({ initialValues: ["/a", "/b"], output: process.stderr }),
    );
  });
});

describe("progress reporter", () => {
  const run = (reporter: (event: ProgressEvent) => void, events: ProgressEvent[]) => {
    for (const event of events) reporter(event);
  };
  const start = (analyzer: keyof typeof LABELS): ProgressEvent => ({ type: "start", analyzer });
  const done = (analyzer: keyof typeof LABELS): ProgressEvent => ({
    type: "done",
    analyzer,
    durationMs: 1,
    count: 0,
  });

  it("prints a line per analyzer without animation", async () => {
    const chunks = captureStderr();
    const reporter = await createProgressReporter({ labels: LABELS, animated: false });
    run(reporter, [
      start("lint"),
      start("template"),
      done("lint"),
      { type: "fail", analyzer: "template", durationMs: 1, reason: "boom" },
    ]);
    const output = chunks.join("");
    expect(output).toContain("✔ Running lint checks.");
    expect(output).toContain("✖ Template checks failed: boom");
  });

  it("is silent with --quiet", async () => {
    configureLogger({ level: "quiet" });
    const chunks = captureStderr();
    const createSpinner = vi.fn();
    const reporter = await createProgressReporter({ labels: LABELS, animated: true, createSpinner });
    run(reporter, [start("lint"), done("lint")]);
    expect(chunks).toEqual([]);
    expect(createSpinner).not.toHaveBeenCalled();
  });

  it("drives a single spinner for parallel analyzers and prints outcomes at the end", async () => {
    const chunks = captureStderr();
    const spinner: ProgressSpinner = {
      start: vi.fn(),
      message: vi.fn(),
      stop: vi.fn(),
      error: vi.fn(),
    };
    const reporter = await createProgressReporter({
      labels: LABELS,
      animated: true,
      createSpinner: () => spinner,
    });
    run(reporter, [start("lint"), start("template"), done("lint")]);
    expect(spinner.start).toHaveBeenCalledTimes(1);
    expect(spinner.start).toHaveBeenCalledWith("Running lint checks...");
    expect(spinner.message).toHaveBeenLastCalledWith("Running template checks...");
    expect(spinner.stop).not.toHaveBeenCalled();
    expect(chunks).toEqual([]);

    reporter(done("template"));
    expect(spinner.stop).toHaveBeenCalledWith("Ran lint and template checks.");
    expect(chunks.join("")).toContain("✔ Running template checks.");
  });

  it("ends the spinner as an error when an analyzer fails", async () => {
    captureStderr();
    const spinner: ProgressSpinner = {
      start: vi.fn(),
      message: vi.fn(),
      stop: vi.fn(),
      error: vi.fn(),
    };
    const reporter = await createProgressReporter({
      labels: LABELS,
      animated: true,
      createSpinner: () => spinner,
    });
    run(reporter, [start("lint"), { type: "fail", analyzer: "lint", durationMs: 1, reason: "x" }]);
    expect(spinner.error).toHaveBeenCalled();
    expect(spinner.stop).not.toHaveBeenCalled();
  });
});
