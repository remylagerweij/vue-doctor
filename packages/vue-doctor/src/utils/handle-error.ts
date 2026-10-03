import { EXIT_CODES } from "../core/gate.js";
import { logger } from "./logger.js";

/** Reports an error that prevented Vue Doctor from running and exits with the usage-error code. */
export const handleError = (error: unknown): never => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  process.exit(EXIT_CODES.usageError);
};
