import { logger } from "./logger.js";

export const handleError = (error: unknown): never => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  process.exit(1);
};
