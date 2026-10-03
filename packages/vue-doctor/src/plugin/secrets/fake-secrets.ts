/**
 * Pattern-valid but fake credentials for tests and rule cases. They are assembled at run time so
 * the repository never contains a literal credential (GitHub push protection and secret scanners
 * would flag it). Used by `*.cases.ts` files and tests only; never imported by the plugin.
 */

const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Deterministic pseudo-random string (a small LCG): the same `seed` always gives the same text. */
export const fakeBody = (length: number, seed: number, alphabet = ALPHANUMERIC): string => {
  let state = (seed * 2654435761) >>> 0 || 1;
  let text = "";
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    text += alphabet[(state >>> 8) % alphabet.length];
  }
  return text;
};

const base64Url = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A JWT with the given claims and a fake signature. */
export const fakeJwt = (claims: Record<string, unknown>, seed = 1): string =>
  [base64Url({ alg: "HS256", typ: "JWT" }), base64Url(claims), fakeBody(43, seed)].join(".");

/** Every provider format the secrets rule knows, as `[label, value]`. */
export const FAKE_PROVIDER_SECRETS: readonly (readonly [string, string])[] = [
  ["OpenAI project key", ["sk", "proj", fakeBody(64, 11)].join("-")],
  ["OpenAI legacy key", `sk-${fakeBody(48, 12)}`],
  ["Anthropic key", ["sk", "ant", "api03", fakeBody(93, 13)].join("-")],
  ["Google API key", `AIza${fakeBody(35, 14)}`],
  ["GitHub token", `ghp_${fakeBody(36, 15)}`],
  ["GitHub fine-grained token", `github_pat_${fakeBody(82, 16)}`],
  ["Slack token", `xoxb-${fakeBody(12, 17, "0123456789")}-${fakeBody(12, 18, "0123456789")}-${fakeBody(24, 19)}`],
  ["Stripe live key", `sk_live_${fakeBody(24, 20)}`],
  ["Supabase service_role key", fakeJwt({ iss: "supabase", role: "service_role", exp: 1983812996 }, 21)],
  ["AWS access key ID", `AKIA${fakeBody(16, 22, "ABCDEFGHJKLMNPQRSTUVWXYZ234567")}`],
  ["private key", `-----BEGIN ${"RSA"} PRIVATE KEY-----`],
];
