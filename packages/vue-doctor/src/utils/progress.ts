import type { AnalyzerName, ProgressEvent } from "../core/diagnose.js";
import { highlighter } from "./highlighter.js";
import { logger } from "./logger.js";

/** The slice of the `@clack/prompts` spinner this module uses. */
export interface ProgressSpinner {
  start: (message?: string) => void;
  message: (message?: string) => void;
  stop: (message?: string) => void;
  error: (message?: string) => void;
}

export interface ProgressReporterOptions {
  /** Human labels per analyzer, e.g. `lint checks`. */
  labels: Record<AnalyzerName, string>;
  /** Draw one animated spinner. Otherwise print a plain line as each analyzer finishes. */
  animated: boolean;
  /** Factory for the animated spinner; defaults to a `@clack/prompts` spinner on stderr. */
  createSpinner?: () => ProgressSpinner | Promise<ProgressSpinner>;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const joinLabels = (labels: string[]): string =>
  labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : labels[0];

/** Spinners are status output: always stderr, and only animated on an interactive terminal. */
export const isAnimatedOutput = (): boolean => Boolean(process.stderr.isTTY) && !process.env.CI;

const createClackSpinner = async (): Promise<ProgressSpinner> => {
  const { spinner } = await import("@clack/prompts");
  return spinner({ output: process.stderr, withGuide: false, indicator: "dots" });
};

const describeFailure = (label: string, reason: string): string =>
  reason.includes("native binding")
    ? `${capitalize(label)} failed — oxlint's native binding requires a compatible Node.js version.`
    : `${capitalize(label)} failed: ${reason}`;

/**
 * Reports analyzer progress on stderr. The analyzers run in parallel but a terminal spinner is a
 * single line, so animated output is one spinner naming what is still running; the outcome of
 * each analyzer is printed as a ✔/✖ line once all of them settled. Without a TTY (or in CI) there
 * is no animation and each outcome is printed as soon as it is known. `--quiet` prints nothing.
 */
export const createProgressReporter = async (
  options: ProgressReporterOptions,
): Promise<(event: ProgressEvent) => void> => {
  if (logger.isQuiet()) return () => {};

  const { labels } = options;
  const spinnerHandle = options.animated
    ? await (options.createSpinner ?? createClackSpinner)()
    : undefined;
  const running = new Set<AnalyzerName>();
  const outcomes: string[] = [];
  const startedLabels: string[] = [];
  let hasFailure = false;
  let isSpinnerStarted = false;

  const runningMessage = (): string =>
    `Running ${joinLabels([...running].map((analyzer) => labels[analyzer]))}...`;

  return (event) => {
    const label = labels[event.analyzer];
    if (event.type === "start") {
      running.add(event.analyzer);
      startedLabels.push(label);
      if (!spinnerHandle) return;
      if (isSpinnerStarted) spinnerHandle.message(runningMessage());
      else {
        spinnerHandle.start(runningMessage());
        isSpinnerStarted = true;
      }
      return;
    }

    running.delete(event.analyzer);
    if (event.type === "fail") hasFailure = true;
    const line =
      event.type === "done"
        ? `${highlighter.success("✔")} Running ${label}.`
        : `${highlighter.error("✖")} ${describeFailure(label, event.reason)}`;

    if (!spinnerHandle) {
      logger.log(line);
      return;
    }
    outcomes.push(line);
    if (running.size > 0) {
      spinnerHandle.message(runningMessage());
      return;
    }
    if (hasFailure) spinnerHandle.error("Some checks did not complete.");
    else spinnerHandle.stop(`Ran ${joinLabels(startedLabels.map((entry) => entry.replace(/ checks$/, "")))} checks.`);
    for (const outcome of outcomes) logger.log(outcome);
  };
};

export interface BatchProgressOptions {
  labels: Record<AnalyzerName, string>;
  /** Number of projects scanned in this batch. */
  total: number;
  animated: boolean;
  createSpinner?: () => ProgressSpinner | Promise<ProgressSpinner>;
}

export interface BatchProgress {
  /** Progress handler for the project at `index`; only records its outcome lines. */
  forProject: (index: number) => (event: ProgressEvent) => void;
  /** Marks a project as finished (all its analyzers settled) and updates the spinner. */
  projectDone: () => void;
  /** Stops the spinner. Call once, after the last project (also when the batch failed). */
  finish: () => void;
  /** Prints the recorded outcome lines of the project at `index`, in the order they happened. */
  flush: (index: number) => void;
}

/**
 * Progress for several projects scanned concurrently. Their analyzers interleave in time, so
 * nothing is printed while they run except one spinner counting finished projects; each project's
 * ✔/✖ lines are recorded and printed afterwards, project by project in a fixed order (`flush`), which
 * keeps the output deterministic and readable. `--quiet` prints nothing.
 */
export const createBatchProgressReporter = async (options: BatchProgressOptions): Promise<BatchProgress> => {
  if (logger.isQuiet()) {
    return { forProject: () => () => {}, projectDone: () => {}, finish: () => {}, flush: () => {} };
  }

  const { labels, total } = options;
  const spinnerHandle = options.animated
    ? await (options.createSpinner ?? createClackSpinner)()
    : undefined;
  const lines = new Map<number, string[]>();
  let finished = 0;
  let hasFailure = false;

  const progressMessage = (): string => `Scanning ${total} projects (${finished}/${total} done)...`;
  spinnerHandle?.start(progressMessage());

  return {
    forProject: (index) => (event) => {
      if (event.type === "start") return;
      const label = labels[event.analyzer];
      if (event.type === "fail") hasFailure = true;
      const line =
        event.type === "done"
          ? `${highlighter.success("✔")} Running ${label}.`
          : `${highlighter.error("✖")} ${describeFailure(label, event.reason)}`;
      lines.set(index, [...(lines.get(index) ?? []), line]);
    },
    projectDone: () => {
      finished += 1;
      spinnerHandle?.message(progressMessage());
    },
    finish: () => {
      if (!spinnerHandle) return;
      if (hasFailure) spinnerHandle.error("Some checks did not complete.");
      else spinnerHandle.stop(`Scanned ${total} projects.`);
    },
    flush: (index) => {
      for (const line of lines.get(index) ?? []) logger.log(line);
    },
  };
};
