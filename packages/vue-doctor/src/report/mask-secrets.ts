/** What replaces a masked value. */
export const MASK = "[REDACTED]";

/** Shortest run of token characters that is treated as a credential when it mixes letters and digits. */
const GENERIC_TOKEN_MIN_LENGTH = 24;

/**
 * Prefix-based credential formats (unanchored, unlike the detection patterns of the secrets rule,
 * because here they sit inside prose or code). Order matters only for readability.
 */
const KNOWN_TOKEN_PATTERNS: readonly RegExp[] = [
  /\bsk_(?:live|test)_[A-Za-z0-9]+/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bglpat-[A-Za-z0-9_-]{16,}/g,
  /\bxox[bporas]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  // JSON Web Tokens: three base64url segments, the first two starting with `eyJ` (a JSON object).
  /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,
];

/** `Bearer <token>` / `Basic <token>` credentials in header-like text. */
const AUTH_HEADER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;

/**
 * Assignments to credential-named keys (`apiSecret = "…"`, `password: '…'`, `token=…`): the value
 * is masked whatever it looks like. Only a value that follows the separator directly is touched.
 */
const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Za-z0-9_.-]*(?:api_?key|secret|token|password|passwd|credential|auth)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["'`])([^"'`\n]{4,})\2/gi;

/**
 * Long runs of token characters that mix letters and digits (hashes, random keys). `.` and `/` are
 * not token characters, so paths, URLs and dotted identifiers are left alone.
 */
const GENERIC_TOKEN_PATTERN = new RegExp(`(?<![A-Za-z0-9_+=-])[A-Za-z0-9_+=-]{${GENERIC_TOKEN_MIN_LENGTH},}(?![A-Za-z0-9_+=-])`, "g");

const looksRandom = (candidate: string): boolean => /[A-Za-z]/.test(candidate) && /\d/.test(candidate);

/**
 * Masks anything in `text` that looks like a credential: well-known token formats, JWTs, auth
 * headers, values assigned to secret-named keys, and long random-looking strings. Deterministic and
 * idempotent; it errs on the side of masking, since the text ends up in PR comments and chat logs.
 */
export const maskSecrets = (text: string): string => {
  let masked = text;
  for (const pattern of KNOWN_TOKEN_PATTERNS) masked = masked.replace(pattern, MASK);
  masked = masked.replace(AUTH_HEADER_PATTERN, (_match, scheme: string) => `${scheme} ${MASK}`);
  masked = masked.replace(SECRET_ASSIGNMENT_PATTERN, (_match, head: string, quote: string) => `${head}${quote}${MASK}${quote}`);
  masked = masked.replace(GENERIC_TOKEN_PATTERN, (candidate) => (looksRandom(candidate) ? MASK : candidate));
  return masked;
};
