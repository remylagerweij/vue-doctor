import { JWT_REGEX, decodeJwtPayload } from "./providers.js";

/**
 * Name-based detection: a secret-looking identifier assigned a literal that looks random. Used for
 * credentials of providers the pattern pack does not know and for plain passwords.
 */

/** Splits `apiKey`, `API_KEY`, `APIKey`, `api-key` and `api.key` into lower-case words. */
export const splitIdentifier = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** Single words that make a name secret-ish. Plurals (`tokens`, design tokens) deliberately do not. */
const SECRET_WORDS = new Set([
  "secret",
  "password",
  "passwd",
  "pwd",
  "passphrase",
  "token",
  "credential",
  "credentials",
  "apikey",
  "authorization",
  "bearer",
  "privatekey",
]);

/** Word pairs that are secret-ish only together (`key` alone is far too common). */
const SECRET_PAIRS: readonly (readonly [string, string])[] = [
  ["api", "key"],
  ["private", "key"],
  ["secret", "key"],
  ["access", "key"],
  ["signing", "key"],
  ["encryption", "key"],
  ["auth", "key"],
];

/** The last word of `tokenType`, `passwordLabel`, `secretName`: describes the secret rather than being one. */
const DESCRIPTOR_WORDS = new Set([
  "label",
  "text",
  "title",
  "name",
  "id",
  "url",
  "uri",
  "path",
  "route",
  "page",
  "param",
  "params",
  "field",
  "column",
  "header",
  "placeholder",
  "description",
  "hint",
  "type",
  "icon",
  "class",
  "style",
  "variant",
  "event",
  "action",
  "message",
  "error",
  "prefix",
  "suffix",
  "regex",
  "pattern",
  "length",
  "min",
  "max",
  "expiry",
  "expires",
  "ttl",
  "endpoint",
  "storage",
  "cookie",
  "env",
  "ref",
  "input",
  "modal",
  "state",
  "status",
  "enabled",
  "required",
  "policy",
  "rule",
  "rules",
  "validator",
  "schema",
  "count",
  "key",
]);

/** Words that mark a credential as public by design (publishable/anon keys, reCAPTCHA site keys). */
const PUBLIC_WORDS = new Set(["public", "publishable", "pub", "pk", "anon", "site", "sitekey", "dsn"]);

export type NameKind = "password" | "token" | "authorization";

/**
 * How a name is secret-ish, or `undefined` when it is not. `apiKey`, `API_KEY`, `x-api-key` and
 * `clientSecret` qualify; `author`, `passwordLabel`, `tokenType`, `publicKey` and `apiKeyHeader` do not.
 */
export const classifySecretName = (name: string): NameKind | undefined => {
  const words = splitIdentifier(name);
  if (words.length === 0 || words.some((word) => PUBLIC_WORDS.has(word))) return undefined;
  const last = words[words.length - 1];
  const joined = words.join("");

  const isPair = SECRET_PAIRS.some(([first, second]) => words.some((word, index) => word === first && words[index + 1] === second));
  const secretWord = words.find((word) => SECRET_WORDS.has(word));
  if (!isPair && !secretWord && !SECRET_WORDS.has(joined)) return undefined;

  // `secretKey` / `privateKey` end in `key` themselves; `keyName`, `tokenType` and friends describe a secret.
  const endsInPair = isPair && SECRET_PAIRS.some(([first, second]) => words[words.length - 2] === first && last === second);
  if (!endsInPair && DESCRIPTOR_WORDS.has(last) && !SECRET_WORDS.has(last)) return undefined;
  // `author`-style prefixes cannot happen (whole words only); `authorization` is the one header worth checking.
  if (words.includes("authorization")) return "authorization";
  if (words.some((word) => ["password", "passwd", "pwd", "passphrase"].includes(word))) return "password";
  return "token";
};

/** Shannon entropy in bits per character. */
export const shannonEntropy = (value: string): number => {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
};

/** Stand-ins and samples that are never real credentials. */
const PLACEHOLDER_VALUE =
  /^(?:x{3,}|\*+|\.{3,}|-+|_+|0+|1234\d*|test\w*|demo|dummy|sample|example|changeme|change[-_ ]?me|replace[-_ ]?me|todo|tbd|none|null|undefined|secret|password|token|redacted|your[-_ ].*|my[-_ ].*|<.*>|\$\{.*\}|\{\{.*\}\}|%.*%)$|^(?:x{4,}|\*{4,})|your[-_ ]?(?:api|secret|token|key|password)|placeholder|changeme|example|dummy|<[^>]+>|\{\{|\$\{|process\.env|import\.meta\.env/i;

export const isPlaceholderValue = (value: string): boolean => PLACEHOLDER_VALUE.test(value.trim());

/** A snake/kebab/dotted identifier or route (`user_session_cookie`, `/auth/login`): a name, not a credential. */
const IDENTIFIER_LIKE = /^[a-z][a-z0-9]*(?:[._:/-][a-z][a-z0-9]*)+$/;

const PASSWORD_MIN_LENGTH = 6;
const TOKEN_MIN_LENGTH = 16;
const PASSWORD_MIN_ENTROPY = 2.5;
const TOKEN_MIN_ENTROPY = 3.2;

const BASIC_BEARER = /^(?:Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{16,})$/;

const characterClasses = (value: string): number =>
  [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((expression) => expression.test(value)).length;

/** A JWT-shaped value is only worth reporting when it is not a public (anon) Supabase token. */
const isPublicJwt = (value: string): boolean => {
  const match = JWT_REGEX.exec(value);
  if (!match) return false;
  const role = decodeJwtPayload(match[0])?.role;
  return role === "anon";
};

/**
 * Whether `value`, assigned to a name of the given kind, looks like a real hardcoded credential:
 * long enough, no spaces, not a placeholder or identifier, with enough entropy. Passwords are
 * human-chosen and short, so they get lower bars than machine-generated tokens.
 */
export const looksLikeSecretValue = (value: string, kind: NameKind): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || isPlaceholderValue(trimmed) || isPublicJwt(trimmed)) return false;
  if (kind === "authorization") {
    const credential = BASIC_BEARER.exec(trimmed)?.[1];
    return credential !== undefined && !isPlaceholderValue(credential) && shannonEntropy(credential) >= TOKEN_MIN_ENTROPY;
  }
  if (/\s/.test(trimmed)) return false;
  if (kind === "password") {
    return trimmed.length >= PASSWORD_MIN_LENGTH && !IDENTIFIER_LIKE.test(trimmed) && shannonEntropy(trimmed) >= PASSWORD_MIN_ENTROPY;
  }
  if (trimmed.length < TOKEN_MIN_LENGTH || IDENTIFIER_LIKE.test(trimmed)) return false;
  // Real tokens carry digits or mixed case; a long run of lower-case words is prose or a name.
  if (characterClasses(trimmed) < 2 || !/\d/.test(trimmed)) return false;
  return shannonEntropy(trimmed) >= TOKEN_MIN_ENTROPY;
};
