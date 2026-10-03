/**
 * Escaping helpers for the Markdown formatter. Every string that derives from the scanned project
 * (messages, file paths, project names, rule help) goes through one of these before it is placed in
 * a comment, so hostile source code cannot inject HTML, links, mentions, issue references or
 * Markdown structure into a PR comment or step summary (threat T9 of the 2.0 analysis).
 */

/** Invisible separator that breaks GitHub's autolinking (`@mention`, `#123`, URLs) without changing the visible text. */
export const ZERO_WIDTH_SPACE = "​";

// C0 controls except tab/newline (handled by whitespace collapsing), DEL, and bidirectional overrides
// (Trojan Source: they reorder how text renders). Written as escapes so the source itself stays plain.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g;
const URL_SCHEME = /\b(https?|ftps?|file):\/\//gi;
const WWW_PREFIX = /\bwww\./gi;
const MARKDOWN_SPECIAL = /[\\`*_[\]()<>&|~#!$]/g;

const stripControlCharacters = (text: string): string => text.replace(CONTROL_CHARACTERS, "");

/** Collapses every run of whitespace (including line breaks) to one space: the text stays on one line. */
const toSingleLine = (text: string): string => stripControlCharacters(text).replace(/\s+/g, " ").trim();

/**
 * Makes user text inert inside a Markdown paragraph, list item or table cell: one line, HTML and
 * Markdown control characters escaped, `@mentions`, `#123` references and raw URLs/autolinks broken
 * with a zero-width space. Use `markdownCode` for paths and identifiers; it reads better.
 */
export const escapeMarkdown = (text: string): string =>
  toSingleLine(text)
    .replace(URL_SCHEME, `$1:/${ZERO_WIDTH_SPACE}/`)
    .replace(WWW_PREFIX, `www${ZERO_WIDTH_SPACE}.`)
    .replace(/@/g, `@${ZERO_WIDTH_SPACE}`)
    .replace(/#(?=\d)/g, `#${ZERO_WIDTH_SPACE}`)
    .replace(MARKDOWN_SPECIAL, (character) => {
      if (character === "<") return "&lt;";
      if (character === ">") return "&gt;";
      if (character === "&") return "&amp;";
      return `\\${character}`;
    });

const longestBacktickRun = (text: string): number => Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));

/**
 * Inline code span that cannot be broken out of: the fence is one backtick longer than the longest
 * backtick run inside. Inside a table cell, `|` is escaped too (GFM unescapes it inside code).
 */
export const markdownCode = (text: string, options: { inTable?: boolean } = {}): string => {
  let content = toSingleLine(text);
  if (options.inTable) content = content.replaceAll("|", "\\|");
  if (content === "") return "";
  const fence = "`".repeat(longestBacktickRun(content) + 1);
  const padding = content.startsWith("`") || content.endsWith("`") ? " " : "";
  return `${fence}${padding}${content}${padding}${fence}`;
};

/** Fenced code block whose fence is longer than any backtick run inside, so the content cannot close it. */
export const markdownFence = (text: string, language = "text"): string => {
  const content = stripControlCharacters(text).replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const fence = "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
  const info = language.replace(/[^a-z0-9-]/gi, "");
  return `${fence}${info}\n${content}\n${fence}`;
};

/**
 * Returns `url` when it is an https URL on the trusted docs origin, with the characters that could
 * end a Markdown link destination percent-encoded; otherwise `null` (the caller then prints no link).
 */
export const toTrustedUrl = (url: string, trustedBaseUrl: string): string | null => {
  try {
    const parsed = new URL(url);
    const trusted = new URL(trustedBaseUrl);
    if (parsed.protocol !== "https:" || parsed.origin !== trusted.origin) return null;
    if (parsed.username !== "" || parsed.password !== "") return null;
    return parsed.href.replace(/[()<>\s]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  } catch {
    return null;
  }
};

/** Keeps only characters that are safe inside an HTML comment marker (no `-`, so `-->` cannot occur). */
export const sanitizeMarkerId = (id: string): string => id.replace(/[^A-Za-z0-9_.:]/g, "");
