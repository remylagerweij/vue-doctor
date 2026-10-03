import os from "node:os";

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 4;

/**
 * How many oxlint processes run at once. oxlint is itself multi-threaded (it lints files on all
 * cores), so extra processes mostly overlap spawn, config load and JSON parsing instead of adding
 * CPU parallelism. Half the available cores, capped at 4, keeps the machine responsive while
 * eslint-plugin-vue and knip run next to it, and never drops below 1.
 */
export const resolveBatchConcurrency = (
  availableParallelism: number = os.availableParallelism(),
): number =>
  Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.floor(availableParallelism / 2)));

