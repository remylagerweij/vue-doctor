import { highlighter } from "./highlighter.js";

/**
 * - `quiet`: only warnings and errors (`--quiet`).
 * - `normal`: status output (banner, progress, hints) plus warnings and errors.
 * - `debug`: everything, plus `logger.debug()` lines (`--debug` or `DEBUG=vue-doctor:*`).
 */
export type LogLevel = "quiet" | "normal" | "debug";

const DEBUG_NAMESPACE_PREFIX = "vue-doctor";

let level: LogLevel = "normal";
let debugPatterns: RegExp[] = [];
let debugExcludes: RegExp[] = [];

const writeLine = (stream: NodeJS.WriteStream, message: string): void => {
  stream.write(`${message}\n`);
};

const toPattern = (glob: string): RegExp =>
  new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);

/** Parses a `DEBUG` value (comma/space separated, `*` wildcards, `-` prefix excludes) the `debug` package way. */
const parseDebugEnv = (value: string | undefined): { include: RegExp[]; exclude: RegExp[] } => {
  const include: RegExp[] = [];
  const exclude: RegExp[] = [];
  for (const entry of (value ?? "").split(/[\s,]+/).filter(Boolean)) {
    if (entry.startsWith("-")) exclude.push(toPattern(entry.slice(1)));
    else include.push(toPattern(entry));
  }
  return { include, exclude };
};

/**
 * Sets the log level. `DEBUG=vue-doctor:*` (or a narrower namespace such as `vue-doctor:config`)
 * enables debug output for matching namespaces without `--debug`.
 */
export const configureLogger = (options: { level?: LogLevel; debugEnv?: string } = {}): void => {
  const { include, exclude } = parseDebugEnv(options.debugEnv);
  debugExcludes = exclude;
  if (options.level === "debug") {
    debugPatterns = [toPattern(`${DEBUG_NAMESPACE_PREFIX}:*`)];
    level = "debug";
    return;
  }
  debugPatterns = include;
  level = options.level ?? "normal";
};

const isDebugEnabled = (namespace: string): boolean => {
  const fullNamespace = `${DEBUG_NAMESPACE_PREFIX}:${namespace}`;
  return (
    debugPatterns.some((pattern) => pattern.test(fullNamespace)) &&
    !debugExcludes.some((pattern) => pattern.test(fullNamespace))
  );
};

const status =
  (format: (message: string) => string) =>
  (message: string): void => {
    if (level !== "quiet") writeLine(process.stderr, format(message));
  };

/**
 * Status output: banners, progress, hints, warnings and errors. Always goes to stderr so that
 * stdout only ever carries the report (text, JSON, score), which keeps `| jq` and redirects safe.
 */
export const logger = {
  log: status((message) => message),
  info: status(highlighter.info),
  success: status(highlighter.success),
  dim: status(highlighter.dim),
  break: (): void => {
    if (level !== "quiet") writeLine(process.stderr, "");
  },
  /** Shown at every level, including `--quiet`. */
  warn: (message: string): void => writeLine(process.stderr, highlighter.warn(message)),
  /** Shown at every level, including `--quiet`. */
  error: (message: string): void => writeLine(process.stderr, highlighter.error(message)),
  /** `vue-doctor:<namespace> message`, only when that namespace is enabled. */
  debug: (namespace: string, message: string): void => {
    if (!isDebugEnabled(namespace)) return;
    writeLine(process.stderr, highlighter.dim(`${DEBUG_NAMESPACE_PREFIX}:${namespace} ${message}`));
  },
  isQuiet: (): boolean => level === "quiet",
};

/** Report output: the scan result itself. Always goes to stdout. */
export const output = {
  line: (message: string): void => writeLine(process.stdout, message),
  break: (): void => writeLine(process.stdout, ""),
};
