import type { EsTreeNode } from "./types.js";

/**
 * URL-sink helpers shared by `no-javascript-url` and `no-user-controlled-url`, whose script side
 * runs in oxlint and whose template side runs in ESLint (see custom-template-rules.ts), so both
 * engines agree on what a `javascript:` URL and a user-controlled URL are.
 */

export const JAVASCRIPT_URL_MESSAGE =
  "a `javascript:` URL runs code when it is followed (XSS) and is blocked by a strict CSP; use a button with a click handler, or a real URL";

export const USER_CONTROLLED_URL_MESSAGE =
  "a user-controlled value as a URL allows `javascript:` XSS and open redirects; validate it first (`new URL(x, location.origin)` and check `protocol`/`origin`, or an allowlist)";

/** Attributes that take a URL the browser may navigate to or load. `:to` (router-link) is deliberately not one. */
export const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src", "action", "formaction", "xlink:href", "data"]);

/** Whether a name is a URL attribute or DOM property (`href`, `formAction`, `xlink:href`...). */
export const isUrlAttributeName = (name: string | null | undefined): boolean =>
  Boolean(name) && URL_ATTRIBUTES.has(name!.toLowerCase());

const SCHEME_SEPARATOR = "[\\t\\n\\r]*";
/** `javascript:` as browsers parse it: leading control chars/spaces and tabs/newlines inside the scheme are ignored. */
const JAVASCRIPT_SCHEME = new RegExp(
  `^[\\u0000-\\u0020]*${[..."javascript"].join(SCHEME_SEPARATOR)}${SCHEME_SEPARATOR}:(?=\\S)`,
  "i",
);

/** Whether a string is a `javascript:` URL with a body (`javascript:void(0)`); a bare `"javascript:"` blocklist entry is not. */
export const isJavascriptUrl = (value: string): boolean => JAVASCRIPT_SCHEME.test(value);

/** Wrappers that do not change the value: `(x)`, `x as string`, `x!`, `x?.y`. */
const TRANSPARENT_WRAPPERS = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSSatisfiesExpression",
  "ChainExpression",
]);

export const peel = (node: EsTreeNode): EsTreeNode => {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type) && current.expression) current = current.expression;
  return current;
};

/** Literal `javascript:` URL values an expression can evaluate to (`'javascript:x'`, `` `javascript:${x}` ``, `cond ? 'javascript:x' : y`). */
export const findJavascriptUrlLiterals = (node: EsTreeNode | null | undefined, continued = false): EsTreeNode[] => {
  if (!node) return [];
  const expression = peel(node);
  switch (expression.type) {
    case "Literal":
      // A literal that something is appended to (`"javascript:" + code`) has a body even when it ends at the colon.
      return typeof expression.value === "string" && isJavascriptUrl(continued ? `${expression.value}x` : expression.value) ? [expression] : [];
    case "TemplateLiteral": {
      const head: string | undefined = expression.quasis?.[0]?.value?.cooked ?? expression.quasis?.[0]?.value?.raw;
      const hasInterpolation = expression.expressions.length > 0 || continued;
      return head !== undefined && isJavascriptUrl(hasInterpolation ? `${head}x` : head) ? [expression] : [];
    }
    case "BinaryExpression":
      return expression.operator === "+" ? findJavascriptUrlLiterals(expression.left, true) : [];
    case "ConditionalExpression":
      return [...findJavascriptUrlLiterals(expression.consequent), ...findJavascriptUrlLiterals(expression.alternate)];
    case "LogicalExpression":
      return [...findJavascriptUrlLiterals(expression.left), ...findJavascriptUrlLiterals(expression.right)];
    default:
      return [];
  }
};

/** `["route", "query", "next"]` for `route.query.next`, `["useRoute()", ...]` for `useRoute().query.next`; null for anything else. */
export const memberPath = (node: EsTreeNode | null | undefined): string[] | null => {
  if (!node) return null;
  const expression = peel(node);
  if (expression.type === "Identifier") return [expression.name];
  if (expression.type === "ThisExpression") return ["this"];
  if (expression.type === "CallExpression" && expression.callee?.type === "Identifier" && expression.callee.name === "useRoute") {
    return ["useRoute()"];
  }
  if (expression.type !== "MemberExpression") return null;
  const objectPath = memberPath(expression.object);
  if (!objectPath) return null;
  const property = expression.property;
  if (!expression.computed) return property?.type === "Identifier" ? [...objectPath, property.name] : null;
  if (property?.type === "Literal" && typeof property.value === "string") return [...objectPath, property.value];
  return [...objectPath, "[]"];
};

const ROUTE_ROOTS: ReadonlySet<string> = new Set(["$route", "route", "useRoute()"]);
const LOCATION_ROOTS: ReadonlySet<string> = new Set(["location", "window.location", "document.location", "globalThis.location", "self.location"]);
const WINDOW_NAME_PATHS: ReadonlySet<string> = new Set(["window.name", "self.name", "globalThis.name"]);

/** Path below the route object (`this.$route.query.x` and `route.query.x` both give `["query", "x"]`), or null if it is not a route read. */
const routeRest = (path: string[]): string[] | null => {
  if (path[0] === "this" && path[1] === "$route") return path.slice(2);
  return ROUTE_ROOTS.has(path[0]) ? path.slice(1) : null;
};

/** `route.query.next` / `$route.params.id`: one value of the query or the path params. */
const isRouteInputValue = (path: string[]): boolean => {
  const rest = routeRest(path);
  return rest !== null && (rest[0] === "query" || rest[0] === "params") && rest.length >= 2;
};

/** `route.query` / `route.params` themselves (what a destructuring pattern reads from). */
const isRouteInputObject = (node: EsTreeNode): boolean => {
  const path = memberPath(node);
  const rest = path ? routeRest(path) : null;
  return rest !== null && rest.length === 1 && (rest[0] === "query" || rest[0] === "params");
};

/** `location.hash` / `location.search`: user-controlled, but they start with `#` / `?`, so only a stripped value can be a scheme. */
const isLocationFragment = (node: EsTreeNode): boolean => {
  const path = memberPath(node);
  if (!path || path.length < 2) return false;
  const property = path[path.length - 1];
  return LOCATION_ROOTS.has(path.slice(0, -1).join(".")) && (property === "hash" || property === "search");
};

/** Methods that keep (part of) the receiver's text, so a tainted receiver gives a tainted result. */
const PASSTHROUGH_METHODS: ReadonlySet<string> = new Set([
  "slice", "substring", "substr", "trim", "trimStart", "trimEnd", "toString", "toLowerCase", "toUpperCase",
  "replace", "replaceAll", "at", "normalize", "concat",
]);
/** Functions that return their (decoded or stringified) first argument. */
const PASSTHROUGH_FUNCTIONS: ReadonlySet<string> = new Set(["String", "decodeURIComponent", "decodeURI", "unescape", "atob"]);

/** Names the caller learned are bound to user input (`const next = route.query.next`). */
export type TaintedNames = ReadonlySet<string>;

/**
 * Extra source of untrusted values for callers outside the route/location world (Nuxt server
 * handlers: `getQuery(event)`, `readBody(event)`...). Asked first for every sub-expression.
 */
export type UntrustedSource = (node: EsTreeNode, taintedNames: TaintedNames) => boolean;

/** `location.search.slice(1)` / `location.hash.substring(1)`: the fragment with its `?` / `#` stripped. */
const isStrippedLocationFragment = (node: EsTreeNode): boolean => {
  const expression = peel(node);
  return (
    expression.type === "CallExpression" &&
    expression.callee?.type === "MemberExpression" &&
    PASSTHROUGH_METHODS.has(expression.callee.property?.name ?? "") &&
    isLocationFragment(expression.callee.object)
  );
};

const isUrlSearchParamsOfInput = (node: EsTreeNode): boolean => {
  const expression = peel(node);
  if (expression.type !== "NewExpression" || expression.callee?.type !== "Identifier" || expression.callee.name !== "URLSearchParams") {
    return false;
  }
  const argument = expression.arguments?.[0];
  return Boolean(argument) && (isLocationFragment(argument) || isStrippedLocationFragment(argument) || isRouteInputObject(argument));
};

/**
 * Whether the START of the expression's value is user-controlled: a route query/param, a stripped
 * `location.hash`/`location.search`, `window.name`, a `URLSearchParams` lookup, or a name bound to one.
 * Only the start matters for URL sinks: `` `/search?q=${query}` `` cannot turn into `javascript:`.
 */
export const isUserControlledUrl = (
  node: EsTreeNode | null | undefined,
  taintedNames: TaintedNames = new Set(),
  isSource?: UntrustedSource,
): boolean => {
  if (!node) return false;
  const expression = peel(node);
  if (isSource?.(expression, taintedNames)) return true;
  const recurse = (child: EsTreeNode | null | undefined): boolean => isUserControlledUrl(child, taintedNames, isSource);
  switch (expression.type) {
    case "AwaitExpression":
      return recurse(expression.argument);
    case "Identifier":
      return taintedNames.has(expression.name);
    case "MemberExpression": {
      const path = memberPath(expression);
      if (!path) return false;
      if (isRouteInputValue(path) || WINDOW_NAME_PATHS.has(path.join("."))) return true;
      // `next.value` of a tainted ref / computed.
      return path.length === 2 && path[1] === "value" && taintedNames.has(path[0]);
    }
    case "TemplateLiteral": {
      const head: string = expression.quasis?.[0]?.value?.cooked ?? "";
      return head === "" && recurse(expression.expressions?.[0]);
    }
    case "BinaryExpression":
      if (expression.operator !== "+") return false;
      if (expression.left?.type === "Literal" && expression.left.value === "") return recurse(expression.right);
      return recurse(expression.left);
    case "ConditionalExpression":
      return recurse(expression.consequent) || recurse(expression.alternate);
    case "LogicalExpression":
      return (
        (expression.operator !== "&&" && recurse(expression.left)) ||
        recurse(expression.right)
      );
    case "CallExpression": {
      const callee = peel(expression.callee);
      if (callee.type === "Identifier") {
        return PASSTHROUGH_FUNCTIONS.has(callee.name) && recurse(expression.arguments?.[0]);
      }
      if (callee.type !== "MemberExpression" || callee.computed) return false;
      const method: string = callee.property?.name ?? "";
      if (PASSTHROUGH_METHODS.has(method)) {
        return isLocationFragment(callee.object) || recurse(callee.object);
      }
      // `new URLSearchParams(location.search).get("next")` / `params.get("next")` for a bound `params`.
      if (method === "get" || method === "getAll") {
        const receiver = peel(callee.object);
        return isUrlSearchParamsOfInput(receiver) || (receiver.type === "Identifier" && taintedNames.has(receiver.name));
      }
      return false;
    }
    default:
      return false;
  }
};

/**
 * Names a `const` declarator binds to user input: `const next = route.query.next`, a
 * `computed(() => route.query.next)`, `const { next } = route.query`, or
 * `const params = new URLSearchParams(location.search)`.
 */
export const taintedNamesBoundBy = (declarator: EsTreeNode, taintedNames: TaintedNames, isSource?: UntrustedSource): string[] => {
  const { id, init } = declarator;
  if (!init) return [];
  const value = peel(init);
  if (id?.type === "ObjectPattern") {
    if (!isRouteInputObject(value) && !(isSource && isUserControlledUrl(value, taintedNames, isSource))) return [];
    return (id.properties as EsTreeNode[])
      .map((property) => (property.value?.type === "AssignmentPattern" ? property.value.left : property.value))
      .filter((target): target is EsTreeNode => target?.type === "Identifier")
      .map((target) => target.name as string);
  }
  if (id?.type !== "Identifier") return [];
  if (isUrlSearchParamsOfInput(value) || isUserControlledUrl(value, taintedNames, isSource)) return [id.name];
  if (value.type === "CallExpression" && value.callee?.type === "Identifier" && value.callee.name === "computed") {
    const getter = value.arguments?.[0];
    if (getter?.type === "ArrowFunctionExpression" && !getter.async && getter.body?.type !== "BlockStatement") {
      return isUserControlledUrl(getter.body, taintedNames, isSource) ? [id.name] : [];
    }
  }
  return [];
};

/** Call names that validate a URL: `isSafeUrl`, `sanitizeUrl`, `validateRedirect`, `isAllowedHref`, `isTrustedLink`... */
const URL_VALIDATOR_PATTERN =
  /^sanitize$|(?:sanitize|safe|valid|allow|trust|check|verify)\w*(?:url|uri|href|link|redirect|target)|(?:url|uri|href|link|redirect|target)\w*(?:safe|valid|allow|trust|sanitize)/i;

const URL_PREFIX_CHECK_METHODS: ReadonlySet<string> = new Set(["startsWith", "test", "match"]);

/**
 * Expression keys (`next`, `route.query.next`) that a node validates: passed to a URL validator or
 * sanitizer, parsed with `new URL(x)` (the usual `.protocol` / `.origin` check), or prefix-checked
 * with `x.startsWith("/")` / `/^https?:/.test(x)`. A validated value is not reported.
 */
export const validatedUrlKeys = (node: EsTreeNode): string[] => {
  const keys: string[] = [];
  const add = (candidate: EsTreeNode | null | undefined): void => {
    const path = candidate ? memberPath(candidate) : null;
    if (path) keys.push(path.join("."));
  };
  if (node.type === "NewExpression" && node.callee?.type === "Identifier" && node.callee.name === "URL") {
    add(node.arguments?.[0]);
  } else if (node.type === "CallExpression") {
    const callee = peel(node.callee);
    const name: string | undefined =
      callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" ? callee.property?.name : undefined;
    if (!name) return keys;
    if (URL_VALIDATOR_PATTERN.test(name)) {
      for (const argument of node.arguments as EsTreeNode[]) add(argument);
    } else if (callee.type === "MemberExpression" && URL_PREFIX_CHECK_METHODS.has(name)) {
      // `x.startsWith("/")` validates the receiver; `/^https?:/.test(x)` validates the argument.
      add(callee.object);
      add(node.arguments?.[0]);
    }
  }
  return keys;
};

/** Key `validatedUrlKeys` records for an expression that is a plain name or member path, else null. */
export const urlExpressionKey = (node: EsTreeNode | null | undefined): string | null => memberPath(node)?.join(".") ?? null;
