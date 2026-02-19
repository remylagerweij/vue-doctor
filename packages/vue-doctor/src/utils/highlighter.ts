import pc from "picocolors";

export const highlighter = {
  error: (text: string): string => pc.red(text),
  warn: (text: string): string => pc.yellow(text),
  info: (text: string): string => pc.cyan(text),
  success: (text: string): string => pc.green(text),
  dim: (text: string): string => pc.dim(text),
};
