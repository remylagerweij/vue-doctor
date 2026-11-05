import fs from "node:fs";
import path from "node:path";
import type { RuleOptionsById } from "../plugin/registry.js";
import { COOKIE_SESSION_FUNCTIONS } from "../plugin/server-auth.js";
import { readNuxtRenderSettings } from "./nuxt-project.js";

/**
 * Project-wide facts the per-file server rules cannot see: which auto-imported `server/utils`
 * helpers authenticate, whether the session cookie is SameSite, and whether a module or server
 * middleware already rejects cross-site requests. Read from source text with deliberately simple
 * patterns, and passed to those rules as options.
 */
export interface ServerProjectFacts {
  /** Exported `server/utils` functions that read a session and throw 401/403, or call one that does. */
  authFunctions: string[];
  /** Exported `server/utils` functions that read the cookie session, directly or through another helper. */
  sessionFunctions: string[];
  /** SameSite of the session cookie of a known auth module, `null` when no such module is configured. */
  sessionCookieSameSite: "strict" | "lax" | "none" | null;
  /** `nuxt-security` / `nuxt-csurf`, or a server middleware that checks Origin, Referer or Sec-Fetch-Site. */
  csrfProtection: boolean;
}

const SOURCE_EXTENSION = /\.[cm]?[jt]s$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]s$/;
const MAX_FILE_BYTES = 512 * 1024;
const NUXT_CONFIG_FILES = ["nuxt.config.ts", "nuxt.config.mts", "nuxt.config.js", "nuxt.config.mjs", "nuxt.config.cjs"];

const COOKIE_SESSION_CALL = new RegExp(`\\b(?:${COOKIE_SESSION_FUNCTIONS.join("|")})\\s*[<(]`);
/** Session state a middleware put on the event (it may come from a bearer token, so it is auth but not a cookie). */
const CONTEXT_SESSION = /\bevent\.context\.(?:user|auth|session)\b/;
const THROWS_UNAUTHORIZED = /\bstatus(?:Code)?\s*:\s*40[13]\b|\bcreateError\(\s*40[13]\b/;

const SESSION_MODULES = ["@nuxtjs/supabase", "nuxt-auth-utils", "@sidebase/nuxt-auth"];
const CSRF_MODULES = ["nuxt-security", "nuxt-csurf"];
const SAME_SITE_VALUE = /\bsameSite\s*:\s*["'](strict|lax|none)["']/gi;
const ORIGIN_HEADER_READ =
  /(?:getRequestHeader|getHeader|headers\.get)\(\s*(?:[\w$.]+\s*,\s*)?["'](?:origin|referer|sec-fetch-site)["']|headers\s*(?:\.|\[\s*["'])(?:origin|referer|sec-fetch-site)\b/i;
/** What an origin check compares the header with: a Sec-Fetch-Site value or the request's own host. */
const SAME_ORIGIN_COMPARISON = /["'](?:same-origin|same-site|cross-site)["']|\bgetRequest(?:Host|URL)\b|\.host\b/;
const REJECTS_REQUEST = /\b(?:createError|sendError|setResponseStatus)\b|\bthrow\b/;

const readSource = (filePath: string): string | null => {
  try {
    if (fs.statSync(filePath).size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
};

const listSourceFiles = (directory: string): string[] => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listSourceFiles(entryPath);
      return entry.isFile() && SOURCE_EXTENSION.test(entry.name) && !TEST_FILE.test(entry.name) && !entry.name.endsWith(".d.ts")
        ? [entryPath]
        : [];
    });
};

/** Removes comments so that a commented-out call is not taken for code (URLs in strings survive). */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const FUNCTION_DECLARATION =
  /(?:^|[\s;}])(export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]|(?:^|[\s;}])(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/g;
/** After a top-level `}` or line break, these continue the same declaration (`): Promise<{ a }> {`, `=> {`, `.then(...)`). */
const CONTINUES_DECLARATION = /[{>=|&,).[?:+\-*/]/;
const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);

interface FunctionSource {
  file: string;
  name: string;
  exported: boolean;
  /** The declaration's text, from its keyword to the end of its body. */
  body: string;
}

/** Bracket depth before each character, ignoring brackets in strings and template literals. */
const bracketDepths = (source: string): Int32Array => {
  const depths = new Int32Array(source.length + 1);
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < source.length; index++) {
    depths[index] = depth;
    const char = source[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (OPENERS.has(char)) depth++;
    else if (CLOSERS.has(char)) depth = Math.max(0, depth - 1);
  }
  depths[source.length] = depth;
  return depths;
};

const nextNonSpace = (source: string, from: number): string => source.slice(from).match(/\S/)?.[0] ?? "";

/** End of the top-level declaration starting at `start`: where it returns to depth 0 and nothing continues it. */
const declarationEnd = (source: string, depths: Int32Array, start: number): number => {
  let opened = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (depths[index + 1] > 0) {
      opened ||= char === "{";
      continue;
    }
    if (char === ";") return index + 1;
    const closesBlock = char === "}" && opened;
    if ((closesBlock || char === "\n") && !CONTINUES_DECLARATION.test(nextNonSpace(source, index + 1))) {
      if (closesBlock || !/[=,(>:]\s*$/.test(source.slice(start, index))) return index + 1;
    }
  }
  return source.length;
};

/** Top-level named functions of a file with their bodies. */
const extractFunctions = (file: string, source: string): FunctionSource[] => {
  const depths = bracketDepths(source);
  const exportedNames = new Set(
    [...source.matchAll(/\bexport\s*\{([^}]*)\}/g)].flatMap((match) =>
      match[1].split(",").map((part) => part.trim().split(/\s+as\s+/)[0]?.trim() ?? ""),
    ),
  );
  return [...source.matchAll(FUNCTION_DECLARATION)].flatMap((match) => {
    const start = (match.index ?? 0) + (/^[\s;}]/.test(match[0]) ? 1 : 0);
    if (depths[start] !== 0) return [];
    const name = match[2] ?? match[4] ?? "";
    return [
      {
        file,
        name,
        exported: Boolean(match[1] ?? match[3]) || exportedNames.has(name),
        body: source.slice(start, declarationEnd(source, depths, start)),
      },
    ];
  });
};

/**
 * Grows `seed` with every function that calls one already in it (`requirePermission` calls
 * `requireContext`). A call resolves to a function of the same file, or to an exported function
 * whose name no other file declares (Nitro auto-imports `server/utils` exports by name).
 */
const closeOverCalls = (functions: readonly FunctionSource[], seed: ReadonlySet<FunctionSource>): Set<string> => {
  const declaredIn = new Map<string, Set<string>>();
  for (const fn of functions) declaredIn.set(fn.name, (declaredIn.get(fn.name) ?? new Set()).add(fn.file));
  const resolves = (caller: FunctionSource, callee: FunctionSource): boolean =>
    callee.file === caller.file || (callee.exported && declaredIn.get(callee.name)?.size === 1);

  const included = new Set(seed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of functions) {
      if (included.has(fn)) continue;
      // Skip the declaration's own name: it is not a call of itself.
      const calls = new Set([...fn.body.slice(fn.body.indexOf(fn.name) + fn.name.length).matchAll(/\b([A-Za-z_$][\w$]*)\s*[<(]/g)].map((match) => match[1]));
      if ([...included].some((callee) => calls.has(callee.name) && resolves(fn, callee))) {
        included.add(fn);
        changed = true;
      }
    }
  }
  return new Set([...included].filter((fn) => fn.exported).map((fn) => fn.name));
};

const inferHelpers = (serverDirectory: string): Pick<ServerProjectFacts, "authFunctions" | "sessionFunctions"> => {
  const functions = listSourceFiles(path.join(serverDirectory, "utils")).flatMap((file) => {
    const source = readSource(file);
    return source ? extractFunctions(file, stripComments(source)) : [];
  });
  const session = closeOverCalls(functions, new Set(functions.filter((fn) => COOKIE_SESSION_CALL.test(fn.body))));
  const auth = closeOverCalls(
    functions,
    new Set(
      functions.filter(
        (fn) => (COOKIE_SESSION_CALL.test(fn.body) || CONTEXT_SESSION.test(fn.body)) && THROWS_UNAUTHORIZED.test(fn.body),
      ),
    ),
  );
  return { authFunctions: [...auth].sort(), sessionFunctions: [...session].sort() };
};

const hasStringLiteral = (source: string, value: string): boolean =>
  new RegExp(`["'\`]${value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}["'\`]`).test(source);

const readNuxtConfig = (directory: string): string | null => {
  for (const name of NUXT_CONFIG_FILES) {
    const source = readSource(path.join(directory, name));
    if (source !== null) return stripComments(source);
  }
  return null;
};

const SAME_SITE_STRENGTH = { strict: 0, lax: 1, none: 2 } as const;

/** The weakest SameSite written in the config, or the auth module's `lax` default. */
const inferSameSite = (nuxtConfig: string | null): ServerProjectFacts["sessionCookieSameSite"] => {
  if (!nuxtConfig || !SESSION_MODULES.some((name) => hasStringLiteral(nuxtConfig, name))) return null;
  let weakest: keyof typeof SAME_SITE_STRENGTH = "lax";
  let explicit = false;
  for (const match of nuxtConfig.matchAll(SAME_SITE_VALUE)) {
    const value = match[1].toLowerCase() as keyof typeof SAME_SITE_STRENGTH;
    if (!explicit || SAME_SITE_STRENGTH[value] > SAME_SITE_STRENGTH[weakest]) weakest = value;
    explicit = true;
  }
  return weakest;
};

const middlewareChecksOrigin = (serverDirectory: string): boolean =>
  listSourceFiles(path.join(serverDirectory, "middleware")).some((file) => {
    const source = readSource(file);
    if (!source) return false;
    const code = stripComments(source);
    const checksOrigin = ORIGIN_HEADER_READ.test(code) && SAME_ORIGIN_COMPARISON.test(code);
    return (/\bcsrf/i.test(code) || checksOrigin) && REJECTS_REQUEST.test(code);
  });

export const collectServerProjectFacts = (directory: string, customServerDir?: string): ServerProjectFacts => {
  const serverDirName = customServerDir || readNuxtRenderSettings(directory).serverDir || "server";
  const serverDirectory = path.isAbsolute(serverDirName) ? serverDirName : path.join(directory, serverDirName);
  const nuxtConfig = readNuxtConfig(directory);
  return {
    ...inferHelpers(serverDirectory),
    sessionCookieSameSite: inferSameSite(nuxtConfig),
    csrfProtection:
      (nuxtConfig !== null && CSRF_MODULES.some((name) => hasStringLiteral(nuxtConfig, name))) ||
      middlewareChecksOrigin(serverDirectory),
  };
};

/** Facts as options of the rules that use them (flat rule names). */
export const inferServerRuleOptions = (directory: string, customServerDir?: string): RuleOptionsById => {
  const facts = collectServerProjectFacts(directory, customServerDir);
  const options: Record<string, Record<string, unknown>> = {};
  if (facts.authFunctions.length > 0) options["auth-missing"] = { authFunctions: facts.authFunctions };
  const csrf: Record<string, unknown> = {};
  if (facts.sessionFunctions.length > 0) csrf.sessionFunctions = facts.sessionFunctions;
  if (facts.sessionCookieSameSite) csrf.sessionCookieSameSite = facts.sessionCookieSameSite;
  if (facts.csrfProtection) csrf.csrfProtection = true;
  if (Object.keys(csrf).length > 0) options["csrf-on-mutating-routes"] = csrf;
  return options;
};
