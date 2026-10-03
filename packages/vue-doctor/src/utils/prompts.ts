import { EXIT_CODES } from "../core/gate.js";
import { logger } from "./logger.js";

export interface MultiselectChoice {
  label: string;
  value: string;
}

/**
 * Cancelling a prompt (Ctrl+C / Esc) means the scan did not run: report it as a usage error,
 * not success. `@clack/prompts` signals cancellation with a symbol instead of exiting itself.
 */
export const exitOnCancel = <T>(answer: T, isCancel: (value: unknown) => boolean): Exclude<T, symbol> => {
  if (isCancel(answer)) {
    logger.dim("Cancelled.");
    process.exit(EXIT_CODES.usageError);
  }
  return answer as Exclude<T, symbol>;
};

/**
 * Interactive multiselect with every choice preselected. The prompt is drawn on stderr so
 * stdout stays reserved for the report. `@clack/prompts` is loaded lazily: runs that never
 * prompt (the common case, and every `-y`/CI run) do not pay for it.
 */
export const promptMultiselect = async (
  message: string,
  choices: MultiselectChoice[],
): Promise<string[]> => {
  const { multiselect, isCancel } = await import("@clack/prompts");
  const answer = await multiselect<string>({
    message,
    options: choices,
    initialValues: choices.map((choice) => choice.value),
    required: false,
    output: process.stderr,
    withGuide: false,
  });
  return exitOnCancel(answer, isCancel);
};
