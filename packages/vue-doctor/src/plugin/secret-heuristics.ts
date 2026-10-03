/**
 * Name and value heuristics for "this looks like a secret" that are shared by the rules about
 * exposure (public runtime config, public env variables, committed `.env` files). They are
 * deliberately conservative: a name match is a medium-confidence signal, a value in a known token
 * format is a high-confidence one.
 *
 * Pure string functions without imports, so the oxlint plugin bundle and the filesystem rules can
 * both use them.
 */

/** Splits `stripeSecretKey`, `STRIPE_SECRET_KEY` and `stripe-secret-key` into lower-case words. */
export const splitNameWords = (name: string): string[] =>
  name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z\d]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** Prefixes that make a variable reach the browser, longest first. */
const PUBLIC_ENV_PREFIXES = ["NUXT_PUBLIC_", "VUE_APP_", "VITE_", "PUBLIC_"] as const;

/** The public prefix of an environment variable name, if it has one. */
export const getPublicEnvPrefix = (name: string): string | null =>
  PUBLIC_ENV_PREFIXES.find((prefix) => name.startsWith(prefix)) ?? null;

/** Whether `name` is one of the variables a bundler or Nuxt exposes to client code. */
export const isPublicEnvName = (name: string): boolean => getPublicEnvPrefix(name) !== null;

/** Words that make a name a secret on their own. */
const SECRET_WORDS = new Set([
  "secret",
  "secrets",
  "password",
  "passwords",
  "passwd",
  "pwd",
  "passphrase",
  "credential",
  "credentials",
  "token",
  "tokens",
  "bearer",
]);

/** Words that mark a name as designed to be public (a publishable or anonymous key, a site key). */
const PUBLIC_WORDS = new Set(["public", "pub", "publishable", "anon", "anonymous", "site", "csrf", "xsrf"]);

/** Last words that describe something *about* a secret (its URL, name or lifetime), not the secret. */
const DESCRIPTOR_LAST_WORDS = new Set([
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
  "expiration",
  "type",
  "length",
  "prefix",
  "field",
  "param",
  "placeholder",
  "text",
  "enabled",
  "required",
]);

/**
 * Vendors whose API keys are never meant for a browser. A bare `API_KEY` in a public variable is
 * too common (Firebase, Maps, analytics keys are public by design) to flag, but `OPENAI_API_KEY`
 * or `SENDGRID_API_KEY` is not.
 */
const SECRET_API_KEY_QUALIFIERS = new Set([
  "secret",
  "private",
  "admin",
  "server",
  "master",
  "service",
  "root",
  "openai",
  "anthropic",
  "claude",
  "sendgrid",
  "mailgun",
  "mailchimp",
  "twilio",
  "resend",
  "groq",
  "openrouter",
  "deepseek",
  "replicate",
  "huggingface",
  "cohere",
  "mistral",
  "stripe",
  "github",
  "gitlab",
  "aws",
  "azure",
  "slack",
]);

/** Tokens that are public by design for these providers (map styles, captcha site tokens). */
const PUBLIC_TOKEN_PROVIDERS = new Set(["mapbox", "recaptcha", "turnstile", "hcaptcha"]);

export interface SecretNameOptions {
  /**
   * `public` (default): the name belongs to a variable or config key that reaches the browser, so
   * a bare `apiKey` is not flagged (see `SECRET_API_KEY_QUALIFIERS`). `private`: a server-side
   * variable, where a bare `API_KEY` is a secret.
   */
  context?: "public" | "private";
}

/**
 * Whether a variable, config key or property name denotes a secret: `secret`, `password`, `token`,
 * `credentials`, `privateKey`, `serviceRole`, a qualified `apiKey`. Public-by-design names
 * (`publishableKey`, `anonKey`, `siteKey`, `publicToken`) and descriptors (`tokenUrl`,
 * `secretName`) are not secrets. A leading `VITE_` / `NUXT_PUBLIC_` / `PUBLIC_` prefix is ignored.
 */
export const looksLikeSecretName = (name: string, options: SecretNameOptions = {}): boolean => {
  const prefix = getPublicEnvPrefix(name);
  const words = splitNameWords(prefix ? name.slice(prefix.length) : name);
  if (words.length === 0) return false;
  if (words.some((word) => PUBLIC_WORDS.has(word))) return false;
  if (DESCRIPTOR_LAST_WORDS.has(words[words.length - 1])) return false;

  if (words.some((word) => PUBLIC_TOKEN_PROVIDERS.has(word)) && words.includes("token")) return false;
  if (words.some((word) => SECRET_WORDS.has(word))) return true;

  // `apiKey` is split into two words, but also appears as one (`APIKEY`, `apikey`).
  const isApiKey = words.includes("apikey") || words.some((word, index) => word === "api" && words[index + 1] === "key");
  if (isApiKey) {
    if (options.context === "private") return true;
    return words.some((word) => SECRET_API_KEY_QUALIFIERS.has(word));
  }

  const isPrivateKey =
    words.includes("privatekey") || words.some((word, index) => word === "private" && words[index + 1] === "key");
  if (isPrivateKey) return true;
  // Supabase's `service_role` key bypasses row-level security.
  return words.some((word, index) => word === "service" && words[index + 1] === "role");
};

/** Formats of credentials that are never meant to be public. */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /^sk_(?:live|test)_[A-Za-z0-9]{10,}/,
  /^rk_live_[A-Za-z0-9]{10,}/,
  /^whsec_[A-Za-z0-9]{16,}/,
  /^AKIA[0-9A-Z]{16}$/,
  /^gh[pousr]_[A-Za-z0-9]{36,}$/,
  /^github_pat_[A-Za-z0-9_]{22,}/,
  /^glpat-[A-Za-z0-9_-]{20,}/,
  /^xox[bporas]-[A-Za-z0-9-]{10,}/,
  /^sk-ant-[A-Za-z0-9_-]{20,}/,
  /^sk-proj-[A-Za-z0-9_-]{20,}/,
  /^sk-[A-Za-z0-9]{32,}$/,
  /^SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/,
  /^npm_[A-Za-z0-9]{36}$/,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
];

const decodeJwtPayload = (value: string): unknown => {
  const [header, payload] = value.split(".");
  if (!header || !payload || !header.startsWith("eyJ")) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/**
 * Whether a string is in the format of a credential that must never be public: provider keys
 * (Stripe `sk_live_`, GitHub, GitLab, Slack, Anthropic, OpenAI, AWS, SendGrid, npm), PEM private
 * keys and Supabase `service_role` JWTs. Publishable keys (`pk_live_`, anon JWTs, Google `AIza`
 * keys) are not matched.
 */
export const matchesSecretValueFormat = (value: string): boolean => {
  const trimmed = value.trim();
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  const payload = decodeJwtPayload(trimmed);
  return typeof payload === "object" && payload !== null && (payload as { role?: unknown }).role === "service_role";
};

const PLACEHOLDER_VALUE_PATTERN =
  /^(?:<.*>|\$\{.*\}|\$[A-Z_]+|\{\{.*\}\}|x{3,}|\*{3,}|\.{3}|(?:your|my|put|insert|replace|example|dummy|fake|sample|todo|change[-_ ]?me)(?:[-_ ].*)?|secret|password|token|test|tbd|changeme)$/i;

/**
 * Whether a value is an empty or obvious placeholder (`changeme`, `<your-key>`, `${OTHER}`,
 * `xxxx`), which declares a variable without containing a real secret.
 */
export const isPlaceholderValue = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed === "" || PLACEHOLDER_VALUE_PATTERN.test(trimmed);
};

/** Whether a URL embeds `user:password@` credentials (`postgres://app:hunter2@db/prod`). */
export const hasCredentialsInUrl = (value: string): boolean => {
  const match = /^[a-z][a-z\d+.-]*:\/\/([^/\s:@]+):([^/\s@]+)@/i.exec(value.trim());
  return match !== null && !isPlaceholderValue(match[2]);
};
