import { describe, expect, it } from "vitest";
import {
  COMMON_DESCRIPTOR_WORDS,
  COMMON_PUBLIC_WORDS,
  COMMON_SECRET_WORDS,
  decodeJwtPayload,
  isEnvPlaceholderValue,
  isLiteralPlaceholderValue,
  splitNameWords,
} from "../src/plugin/secrets/primitives.js";

describe("splitNameWords", () => {
  it.each([
    ["accessToken", ["access", "token"]],
    ["AccessToken", ["access", "token"]],
    ["ACCESS_TOKEN", ["access", "token"]],
    ["auth-token", ["auth", "token"]],
    ["api.key", ["api", "key"]],
    ["x-api-key", ["x", "api", "key"]],
    ["  spaced__out  ", ["spaced", "out"]],
    ["", []],
    ["___", []],
  ])("splits %s", (name, words) => expect(splitNameWords(name)).toEqual(words));

  it("splits acronyms from the following word", () => {
    expect(splitNameWords("JWTToken")).toEqual(["jwt", "token"]);
    expect(splitNameWords("APIKey")).toEqual(["api", "key"]);
    expect(splitNameWords("parseHTMLString")).toEqual(["parse", "html", "string"]);
  });

  it("splits a capital after a digit but keeps digits inside a word", () => {
    expect(splitNameWords("oauth2Token")).toEqual(["oauth2", "token"]);
    expect(splitNameWords("sha256Hash")).toEqual(["sha256", "hash"]);
    expect(splitNameWords("S3_SECRET_KEY")).toEqual(["s3", "secret", "key"]);
    expect(splitNameWords("key2fa")).toEqual(["key2fa"]);
  });
});

describe("shared word lists", () => {
  it("are lower-case, duplicate-free and disjoint where the policies depend on it", () => {
    for (const list of [COMMON_SECRET_WORDS, COMMON_PUBLIC_WORDS, COMMON_DESCRIPTOR_WORDS]) {
      expect(new Set(list).size).toBe(list.length);
      for (const word of list) expect(word).toBe(word.toLowerCase());
    }
    expect(COMMON_SECRET_WORDS.filter((word) => COMMON_PUBLIC_WORDS.includes(word))).toEqual([]);
    expect(COMMON_SECRET_WORDS.filter((word) => COMMON_DESCRIPTOR_WORDS.includes(word))).toEqual([]);
  });
});

describe("placeholder checks", () => {
  it("treat the usual stand-ins as placeholders in both flavours", () => {
    for (const value of ["changeme", "<your-key>", "${OTHER}", "xxxxxx", "your-api-key-here", "secret"]) {
      expect(isEnvPlaceholderValue(value), value).toBe(true);
      expect(isLiteralPlaceholderValue(value), value).toBe(true);
    }
    for (const value of ["abc123def456", "hunter2hunter2"]) {
      expect(isEnvPlaceholderValue(value), value).toBe(false);
      expect(isLiteralPlaceholderValue(value), value).toBe(false);
    }
  });

  it("keeps the documented differences between the env and the literal flavour", () => {
    // Only the env flavour counts an empty value and a bare `$VAR` reference.
    expect(isEnvPlaceholderValue("")).toBe(true);
    expect(isLiteralPlaceholderValue("")).toBe(false);
    expect(isEnvPlaceholderValue("$DB_PASSWORD")).toBe(true);
    expect(isLiteralPlaceholderValue("$DB_PASSWORD")).toBe(false);
    // Only the literal flavour knows `0000`, `none`, `redacted`, `%x%` and unanchored `example`/`process.env`.
    for (const value of ["0000", "none", "redacted", "%TOKEN%", "an-example-value", "process.env.TOKEN"]) {
      expect(isLiteralPlaceholderValue(value), value).toBe(true);
      expect(isEnvPlaceholderValue(value), value).toBe(false);
    }
  });
});

describe("decodeJwtPayload", () => {
  const segment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

  it("decodes an object payload", () => {
    expect(decodeJwtPayload(`eyJhbGciOiJIUzI1NiJ9.${segment({ role: "anon" })}.sig`)).toEqual({ role: "anon" });
  });

  it("returns undefined for anything that is not a JSON object payload", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeUndefined();
    expect(decodeJwtPayload("a.%%%.c")).toBeUndefined();
    expect(decodeJwtPayload(`a.${segment("text")}.c`)).toBeUndefined();
    expect(decodeJwtPayload(`a.${segment(null)}.c`)).toBeUndefined();
    expect(decodeJwtPayload(`.${segment({})}.c`)).toBeUndefined();
  });
});
