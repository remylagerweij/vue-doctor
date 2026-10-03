/**
 * Provider credential formats. The expressions are derived from the gitleaks rule set
 * (https://github.com/gitleaks/gitleaks, MIT License, Copyright (c) 2019 Zachary Rice), adapted to
 * run on a single string literal and to be a little stricter where gitleaks relies on context.
 */

export interface ProviderPattern {
  /** Stable identifier, e.g. `openai-api-key`. */
  id: string;
  /** Name used in messages, e.g. `OpenAI API key`. */
  description: string;
  /** Unanchored: the credential may sit inside a header value or connection string. */
  regex: RegExp;
  /** How sure a match is a live credential; a pattern with a `verify` hook only matches when it passes. */
  confidence: "high" | "medium";
  /** Extra check on the matched text, for formats a regex cannot fully express (JWT claims). */
  verify?: (match: string) => boolean;
}

const decodeBase64Url = (segment: string): string | undefined => {
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  } catch {
    return undefined;
  }
};

/** JWT payload as an object, or `undefined` when the text is not a decodable JWT. */
export const decodeJwtPayload = (token: string): Record<string, unknown> | undefined => {
  const [header, payload] = token.split(".");
  if (!header || !payload) return undefined;
  const json = decodeBase64Url(payload);
  if (json === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

/** Three base64url segments, the first two a JSON object (`eyJ` = `{"`). */
export const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;

/** Supabase issues the same JWT shape for the public `anon` key and the all-powerful `service_role` key. */
const isServiceRoleJwt = (token: string): boolean => decodeJwtPayload(token)?.role === "service_role";

export const PROVIDER_PATTERNS: readonly ProviderPattern[] = [
  {
    id: "anthropic-api-key",
    description: "Anthropic API key",
    regex: /\bsk-ant-(?:api03|admin01)-[A-Za-z0-9_-]{32,}/,
    confidence: "high",
  },
  {
    id: "openai-api-key",
    description: "OpenAI API key",
    // Current project/service-account/admin keys, then the legacy `sk-<48>` and `T3BlbkFJ` ("OpenAI") forms.
    regex: /\bsk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}|[A-Za-z0-9]{48}(?![A-Za-z0-9]))/,
    confidence: "high",
  },
  {
    id: "google-api-key",
    description: "Google API key",
    regex: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/,
    confidence: "high",
  },
  {
    id: "github-token",
    description: "GitHub token",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{70,255})/,
    confidence: "high",
  },
  {
    id: "gitlab-token",
    description: "GitLab personal access token",
    regex: /\bglpat-[A-Za-z0-9_-]{20,}/,
    confidence: "high",
  },
  {
    id: "slack-token",
    description: "Slack token",
    // `xoxb-<digits>-<digits>-<secret>`; the digit requirement keeps `xoxb-your-token-here` out.
    regex: /\bxox[abposr]-(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{20,}/,
    confidence: "high",
  },
  {
    id: "stripe-live-key",
    description: "Stripe live secret key",
    // Secret (`sk_live_`) and restricted (`rk_live_`) keys. `pk_*` is publishable and test keys are harmless.
    regex: /\b[sr]k_live_[A-Za-z0-9]{20,}/,
    confidence: "high",
  },
  {
    id: "supabase-secret-key",
    description: "Supabase secret key",
    regex: /\bsb_secret_[A-Za-z0-9_-]{20,}/,
    confidence: "high",
  },
  {
    id: "supabase-service-role",
    description: "Supabase service_role key",
    regex: JWT_REGEX,
    confidence: "high",
    verify: isServiceRoleJwt,
  },
  {
    id: "aws-access-key-id",
    description: "AWS access key ID",
    regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}(?![A-Z0-9])/,
    confidence: "high",
  },
  {
    id: "private-key",
    description: "private key (PEM block)",
    regex: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/,
    confidence: "high",
  },
  {
    id: "sendgrid-api-key",
    description: "SendGrid API key",
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/,
    confidence: "high",
  },
  {
    id: "npm-token",
    description: "npm access token",
    regex: /\bnpm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/,
    confidence: "high",
  },
  {
    id: "huggingface-token",
    description: "Hugging Face access token",
    regex: /\bhf_[A-Za-z0-9]{34}(?![A-Za-z0-9])/,
    confidence: "high",
  },
];

/** Words that mark a documentation sample or stand-in rather than a live credential. */
const PLACEHOLDER_IN_MATCH = /example|your[-_ ]?|placeholder|dummy|sample|changeme|redacted|xxxx|0000000|\*{4}|\.{3}|<[^>]*>/i;

export interface ProviderMatch {
  pattern: ProviderPattern;
}

/** First provider credential found in `value`, or `undefined`. Sample values (`EXAMPLE`, `xxxx`) never match. */
export const findProviderSecret = (value: string): ProviderMatch | undefined => {
  // Cheap guard: every pattern needs a run of token characters or a PEM header.
  if (value.length < 16) return undefined;
  for (const pattern of PROVIDER_PATTERNS) {
    const found = pattern.regex.exec(value);
    if (!found) continue;
    const matched = found[0];
    if (PLACEHOLDER_IN_MATCH.test(matched)) continue;
    if (pattern.verify && !pattern.verify(matched)) continue;
    return { pattern };
  }
  return undefined;
};
