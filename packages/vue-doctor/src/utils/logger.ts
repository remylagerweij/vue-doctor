import { highlighter } from "./highlighter.js";

export const logger = {
  log: (message: string): void => {
    console.log(message);
  },
  error: (message: string): void => {
    console.error(highlighter.error(message));
  },
  warn: (message: string): void => {
    console.log(highlighter.warn(message));
  },
  success: (message: string): void => {
    console.log(highlighter.success(message));
  },
  info: (message: string): void => {
    console.log(highlighter.info(message));
  },
  dim: (message: string): void => {
    console.log(highlighter.dim(message));
  },
  break: (): void => {
    console.log();
  },
};
