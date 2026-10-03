/**
 * Minimal dotenv reading for the environment-file rules. Only what the rules need: variable names,
 * values and where each one is defined. Values stay inside the rules and are never put into findings.
 */

export interface EnvEntry {
  name: string;
  /** Unquoted value; empty for `NAME=`. */
  value: string;
  /** 1-based line of the definition. */
  line: number;
  /** 1-based column of the variable name. */
  column: number;
}

const ENV_LINE_PATTERN = /^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;

const unquote = (rawValue: string): string => {
  const trimmed = rawValue.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'" || quote === "`") {
    const end = trimmed.indexOf(quote, 1);
    return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
  }
  // Unquoted values end at an inline comment (` # ...`).
  const comment = trimmed.search(/\s#/);
  return (comment === -1 ? trimmed : trimmed.slice(0, comment)).trim();
};

/** Variable definitions of a dotenv file, in file order; comments and malformed lines are skipped. */
export const parseEnvFile = (content: string): EnvEntry[] => {
  const entries: EnvEntry[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((text, index) => {
    if (/^\s*#/.test(text)) return;
    const match = ENV_LINE_PATTERN.exec(text);
    if (!match) return;
    entries.push({
      name: match[2],
      value: unquote(match[3]),
      line: index + 1,
      column: text.indexOf(match[2], match[1].length) + 1,
    });
  });
  return entries;
};

/** `.env`, `.env.local`, `.env.production`, `.env.development.local`, ... (any directory). */
export const isEnvFileName = (fileName: string): boolean => /^\.env(?:\..+)?$/.test(fileName);

/** Files that document variables for others to copy; they are meant to be committed. */
const TEMPLATE_SUFFIX_PATTERN = /\.(?:example|sample|template|tpl|defaults|dist|schema)$/;

/** `.env.example` and friends. */
export const isEnvTemplateFileName = (fileName: string): boolean =>
  isEnvFileName(fileName) && TEMPLATE_SUFFIX_PATTERN.test(fileName);

/**
 * `.env.local`, `.env.production.local`: by Vite, Nuxt (c12) and Vue CLI convention these hold
 * machine-specific values and are git-ignored, so they are never meant to be committed.
 */
export const isLocalEnvFileName = (fileName: string): boolean => isEnvFileName(fileName) && fileName.endsWith(".local");
