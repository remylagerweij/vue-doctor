/**
 * Primitives shared by the three "does this look like a secret" modules: `secret-heuristics.ts`
 * (exposure: public env, runtime config, committed `.env`), `secrets/heuristics.ts` (hardcoded
 * literals) and `sensitive-names.ts` (web storage, postMessage).
 *
 * Pure functions and constants without imports, so the oxlint plugin bundle and the filesystem rules
 * can both use them. Each module layers its own policy on top and keeps its own word sets where the
 * policies deliberately differ; only the words that are the same concept everywhere live here.
 */

/** Splits `stripeSecretKey`, `STRIPE_SECRET_KEY`, `stripe-secret-key` and `JWTToken` into lower-case words. */
export const splitNameWords = (name: string): string[] =>
  name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z\d]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** The words every module treats as a secret on their own (singular only; plurals are per-module). */
export const COMMON_SECRET_WORDS: readonly string[] = [
  "secret",
  "password",
  "passwd",
  "token",
  "credential",
  "credentials",
  "bearer",
];

/** Password abbreviations: secret words for exposure and literal detection, not for storage names. */
export const PASSWORD_ABBREVIATIONS: readonly string[] = ["pwd", "passphrase"];

/** The words that mark a credential as public by design in every module. */
export const COMMON_PUBLIC_WORDS: readonly string[] = ["public", "pub", "publishable", "anon", "site"];

/** Last words that describe a secret (its URL, name or lifetime) rather than being one, in every module. */
export const COMMON_DESCRIPTOR_WORDS: readonly string[] = [
  "url",
  "uri",
  "endpoint",
  "path",
  "name",
  "label",
  "id",
  "header",
  "cookie",
  "ttl",
  "expiry",
  "expires",
  "type",
  "length",
  "prefix",
  "field",
  "param",
  "placeholder",
  "text",
  "enabled",
  "required",
];

/**
 * Placeholder check for values of environment-style declarations (`.env` files, runtime config):
 * empty, `<your-key>`, `${OTHER}`, `$VAR`, `xxxx`, `changeme`, a `your-`/`example-` prefix, or a bare
 * `secret`/`password`/`token`/`test`. The whole value must match, and an empty value counts.
 */
const ENV_PLACEHOLDER_VALUE =
  /^(?:<.*>|\$\{.*\}|\$[A-Z_]+|\{\{.*\}\}|x{3,}|\*{3,}|\.{3}|(?:your|my|put|insert|replace|example|dummy|fake|sample|todo|change[-_ ]?me)(?:[-_ ].*)?|secret|password|token|test|tbd|changeme)$/i;

export const isEnvPlaceholderValue = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed === "" || ENV_PLACEHOLDER_VALUE.test(trimmed);
};

/**
 * Placeholder check for string literals in source (hardcoded-credential candidates). Broader than
 * the env check: unanchored alternatives (`placeholder`, `example`, `process.env`, `${`) and
 * stand-ins such as `0000`, `1234...`, `demo`, `none`, `null` or `redacted`. An empty string is
 * not a placeholder here; callers test emptiness themselves.
 */
const LITERAL_PLACEHOLDER_VALUE =
  /^(?:x{3,}|\*+|\.{3,}|-+|_+|0+|1234\d*|test\w*|demo|dummy|sample|example|changeme|change[-_ ]?me|replace[-_ ]?me|todo|tbd|none|null|undefined|secret|password|token|redacted|your[-_ ].*|my[-_ ].*|<.*>|\$\{.*\}|\{\{.*\}\}|%.*%)$|^(?:x{4,}|\*{4,})|your[-_ ]?(?:api|secret|token|key|password)|placeholder|changeme|example|dummy|<[^>]+>|\{\{|\$\{|process\.env|import\.meta\.env/i;

export const isLiteralPlaceholderValue = (value: string): boolean => LITERAL_PLACEHOLDER_VALUE.test(value.trim());

/** JWT payload as an object, or `undefined` when the text has no decodable JSON-object payload segment. */
export const decodeJwtPayload = (token: string): Record<string, unknown> | undefined => {
  const [header, payload] = token.split(".");
  if (!header || !payload) return undefined;
  try {
    const value: unknown = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};
