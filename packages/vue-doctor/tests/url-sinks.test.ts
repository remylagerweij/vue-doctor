import { parseForESLint } from "vue-eslint-parser";
import { describe, expect, it } from "vitest";
import {
  findJavascriptUrlLiterals,
  isJavascriptUrl,
  isUrlAttributeName,
  isUserControlledUrl,
  memberPath,
  taintedNamesBoundBy,
  urlExpressionKey,
  validatedUrlKeys,
} from "../src/plugin/url-sinks.js";
import { collectNames, isSensitiveName, nameWords } from "../src/plugin/sensitive-names.js";
import type { EsTreeNode } from "../src/plugin/types.js";

const parse = (code: string): EsTreeNode[] =>
  (parseForESLint(code, { ecmaVersion: 2022, sourceType: "module" }).ast as unknown as { body: EsTreeNode[] }).body;

/** The expression of `(<code>);`. */
const expression = (code: string): EsTreeNode => parse(`(${code});`)[0].expression;
/** The first declarator of `const <code>;`. */
const declarator = (code: string): EsTreeNode => parse(`const ${code};`)[0].declarations[0];

describe("isJavascriptUrl", () => {
  it.each(["javascript:alert(1)", "  JavaScript:void(0)", "java\tscript:alert(1)", "\u0001javascript:x"])("matches %j", (value) => {
    expect(isJavascriptUrl(value)).toBe(true);
  });

  it.each(["javascript:", "https://example.com/javascript:x", "javascript", "/docs", "javascript: is a language"])("ignores %j", (value) => {
    expect(isJavascriptUrl(value)).toBe(false);
  });
});

describe("isUrlAttributeName", () => {
  it("knows URL attributes case-insensitively and rejects others", () => {
    expect(["href", "SRC", "formAction", "xlink:href"].every(isUrlAttributeName)).toBe(true);
    expect(isUrlAttributeName("to")).toBe(false);
    expect(isUrlAttributeName(null)).toBe(false);
  });
});

describe("findJavascriptUrlLiterals", () => {
  it.each([
    ["'javascript:void(0)'", 1],
    ["`javascript:${code}`", 1],
    ["'javascript:' + code", 1],
    ["cond ? 'javascript:x' : url", 1],
    ["a || 'javascript:x'", 1],
    ["(`javascript:x`)", 1],
    ["'javascript:'", 0],
    ["`javascript:`", 0],
    ["url", 0],
    ["'https://example.com'", 0],
    ["code + 'javascript:x'", 0],
  ])("%s -> %i", (code, count) => {
    expect(findJavascriptUrlLiterals(expression(code))).toHaveLength(count);
  });

  it("handles a missing node", () => {
    expect(findJavascriptUrlLiterals(undefined)).toEqual([]);
  });
});

describe("memberPath / urlExpressionKey", () => {
  it.each([
    ["route.query.next", ["route", "query", "next"]],
    ["route.query['next']", ["route", "query", "next"]],
    ["route.query[key]", ["route", "query", "[]"]],
    ["useRoute().query.next", ["useRoute()", "query", "next"]],
    ["this.$route.params.id", ["this", "$route", "params", "id"]],
    ["route?.query?.next", ["route", "query", "next"]],
  ])("%s", (code, path) => {
    expect(memberPath(expression(code))).toEqual(path);
  });

  it("returns null for expressions that are not member paths", () => {
    expect(memberPath(expression("fn().x"))).toBeNull();
    expect(memberPath(expression("a[0 + 1].b"))).toEqual(["a", "[]", "b"]);
    expect(memberPath(undefined)).toBeNull();
    expect(urlExpressionKey(expression("a.b"))).toBe("a.b");
    expect(urlExpressionKey(expression("1 + 2"))).toBeNull();
  });
});

describe("isUserControlledUrl", () => {
  const tainted = new Set(["next", "params"]);
  it.each([
    "route.query.next",
    "$route.params.id",
    "this.$route.query.redirect",
    "useRoute().query.to",
    "window.name",
    "next",
    "next.value",
    "String(route.query.next)",
    "decodeURIComponent(location.hash.slice(1))",
    "location.search.substring(1)",
    "window.location.hash.replace('#', '')",
    "route.query.next ?? '/'",
    "cond ? route.query.next : '/'",
    "`${route.query.next}/path`",
    "'' + route.query.next",
    "route.query.next + '/x'",
    "route.query.next.trim()",
    "new URLSearchParams(location.search).get('next')",
    "new URLSearchParams(route.query).get('next')",
    "params.get('next')",
  ])("flags %s", (code) => {
    expect(isUserControlledUrl(expression(code), tainted)).toBe(true);
  });

  it.each([
    "'/home'",
    "location.hash",
    "location.search",
    "route.query",
    "route.hash",
    "props.url",
    "`/search?q=${route.query.q}`",
    "'/x' + route.query.next",
    "sanitizeUrl(route.query.next)",
    "route.query.next && '/x'",
    "other",
    "new URLSearchParams(props.q).get('next')",
    "foo.bar()",
    "location.assign",
    "[route.query.next]",
  ])("accepts %s", (code) => {
    expect(isUserControlledUrl(expression(code), tainted)).toBe(false);
  });

  it("accepts a missing node and uses no tainted names by default", () => {
    expect(isUserControlledUrl(undefined)).toBe(false);
    expect(isUserControlledUrl(expression("next"))).toBe(false);
  });
});

describe("taintedNamesBoundBy", () => {
  it.each([
    ["next = route.query.next", ["next"]],
    ["{ next, to: target } = route.query", ["next", "target"]],
    ["{ id } = useRoute().params", ["id"]],
    ["params = new URLSearchParams(location.search)", ["params"]],
    ["next = computed(() => route.query.next)", ["next"]],
    ["target = String(route.query.t)", ["target"]],
  ])("%s", (code, names) => {
    expect(taintedNamesBoundBy(declarator(code), new Set())).toEqual(names);
  });

  it.each(["next = 1", "{ a } = props", "x = props.url", "y = computed(() => props.url)", "z = computed(() => { return route.query.x })", "[a] = route.query"])(
    "ignores %s",
    (code) => {
      expect(taintedNamesBoundBy(declarator(code), new Set())).toEqual([]);
    },
  );

  it("follows names that were bound earlier", () => {
    expect(taintedNamesBoundBy(declarator("copy = next"), new Set(["next"]))).toEqual(["copy"]);
  });
});

describe("validatedUrlKeys", () => {
  it.each([
    ["new URL(next, location.origin)", ["next"]],
    ["sanitizeUrl(route.query.next)", ["route.query.next"]],
    ["isSafeUrl(next)", ["next"]],
    ["validateRedirect(next)", ["next"]],
    ["next.startsWith('/')", ["next"]],
    ["/^https?:/.test(next)", ["next"]],
    ["$sanitizer.sanitize(next)", ["next"]],
  ])("%s", (code, keys) => {
    expect(validatedUrlKeys(expression(code))).toEqual(keys);
  });

  it("ignores other calls", () => {
    expect(validatedUrlKeys(expression("fetch(next)"))).toEqual([]);
    expect(validatedUrlKeys(expression("a[0](next)"))).toEqual([]);
    expect(validatedUrlKeys(expression("next"))).toEqual([]);
  });
});

describe("sensitive names", () => {
  it("splits names into lowercase words", () => {
    expect(nameWords("accessToken")).toEqual(["access", "token"]);
    expect(nameWords("ACCESS_TOKEN")).toEqual(["access", "token"]);
    expect(nameWords("auth-token")).toEqual(["auth", "token"]);
    expect(nameWords("JWTToken")).toEqual(["jwt", "token"]);
  });

  it.each(["token", "accessToken", "REFRESH_TOKEN", "jwt", "session-id", "authorization", "oauth", "password", "apiKey", "privateKey", "Bearer"])(
    "flags %s",
    (name) => expect(isSensitiveName(name)).toBe(true),
  );

  it.each(["tokenizer", "authenticated", "author", "theme", "csrfToken", "design-tokens", "xsrf_token", "key"])("accepts %s", (name) =>
    expect(isSensitiveName(name)).toBe(false),
  );

  it("collects the names an expression is written with", () => {
    const code = "JSON.stringify({ 'access-token': res.data.jwt, label: 'hello', n: `x${userSession}` }, [a ? b : c], d || e, h + i)";
    const withLiterals = collectNames(expression(code));
    expect(withLiterals).toEqual(expect.arrayContaining(["JSON", "stringify", "access-token", "res", "data", "jwt", "hello", "x", "userSession", "b", "c", "d", "e", "h", "i"]));
    const withoutLiterals = collectNames(expression(code), { literals: false });
    expect(withoutLiterals).not.toContain("hello");
    expect(withoutLiterals).toContain("access-token");
    expect(withoutLiterals).toContain("userSession");
    expect(collectNames(undefined)).toEqual([]);
  });
});
