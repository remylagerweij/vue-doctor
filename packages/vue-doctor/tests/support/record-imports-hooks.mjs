// Module customization hooks, see record-imports.mjs.
import fs from "node:fs";

const logFile = process.env.IMPORT_RECORDER_LOG;

export const resolve = (specifier, context, nextResolve) => {
  const isPackage = !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("file:");
  if (logFile && isPackage && !specifier.startsWith("node:")) {
    fs.appendFileSync(logFile, `${process.pid} ${specifier}\n`);
  }
  return nextResolve(specifier, context);
};
