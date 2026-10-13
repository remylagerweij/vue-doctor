import { defineRule } from "../../define-rule.js";
import { getFilename, getRuleOptions, getStringListOption, walkAst, WALK_SKIP } from "../../helpers.js";
import { COOKIE_SESSION_FUNCTIONS } from "../../server-auth.js";
import { memberPath, peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const MUTATING_HANDLER_PATTERN = /(?:^|\/)server\/api\/.*\.(?:post|put|patch|delete)\.[cm]?[jt]s$/i;
/** `verifyCsrfToken`, `useCsrf`, `assertSameOrigin`, `checkOrigin`. */
const CSRF_GUARD_PATTERN = /csrf|sameorigin|(?:check|verify|assert|validate|ensure)origin/i;
/** Webhook signature checks: such a handler is called by a server, never with a browser's cookies. */
const SIGNATURE_VERIFIER_PATTERN = /^constructEvent(?:Async)?$|verif\w*(?:signature|webhook|hmac)|webhook\w*verif/i;
const HEADER_READERS: ReadonlySet<string> = new Set(["getHeader", "getRequestHeader"]);
const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(["===", "!==", "==", "!="]);
const TEST_METHODS: ReadonlySet<string> = new Set(["includes", "has", "startsWith", "endsWith", "test", "match"]);
/** Calls a header value is handed to in order to check it: `timingSafeEqual(...)`, `isAllowedOrigin(origin)`. */
const CHECK_CALL_PATTERN = /verif|compare|equal|check|valid|allow|trust|match|assert/i;

type HeaderKind = "origin" | "content-type" | "secret";

const headerKindOf = (name: string): HeaderKind | null => {
  const header = name.toLowerCase();
  if (header === "origin" || header === "referer" || header === "sec-fetch-site") return "origin";
  if (header === "content-type") return "content-type";
  if (header === "authorization" || /^x-[\w-]*(?:secret|token|key|signature)$/.test(header)) return "secret";
  return null;
};

const literalString = (node: EsTreeNode | null | undefined): string | null =>
  node?.type === "Literal" && typeof node.value === "string" ? node.value : null;

const calleeName = (callee: EsTreeNode): string | null => {
  const node = peel(callee);
  if (node.type === "Identifier") return node.name;
  return node.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier" ? node.property.name : null;
};

export default defineRule({
  meta: {
    id: "csrf-on-mutating-routes",
    category: "Server",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["nuxt"],
    cwe: ["CWE-352"],
    owasp: "A01:2021",
    fixable: false,
    since: "2.0.0",
    help: "Protect state-changing (mutating) API endpoints that authenticate with a session cookie against Cross-Site Request Forgery (CSRF)",
    agentGuidance:
      "A mutating endpoint (`.post`, `.put`, `.patch`, `.delete`) that authenticates with an ambient session cookie can be called from another site with the user's cookies: " +
      "h3's `readBody` also parses form-encoded and untyped bodies, which a cross-site form can send without a preflight, so a JSON API is not protected by being JSON. " +
      "Prefer one guard for all routes: a `server/middleware` that rejects non-GET `/api/**` requests whose `Sec-Fetch-Site` is present and not `same-origin`/`none` (or whose `Origin` is not your site), or `nuxt-security` / `nuxt-csurf`. " +
      "Per route, compare `getRequestHeader(event, 'origin')` with the expected origin, require `content-type: application/json`, or verify a CSRF token. " +
      "A session cookie with `SameSite=Lax` or `Strict` already blocks cross-site requests (not those from same-site subdomains); the rule reads that from the auth module's config.",
    options: {
      type: "object",
      properties: {
        sessionFunctions: {
          type: "array",
          items: { type: "string" },
          description:
            "Names of project functions that read the cookie session, e.g. `[\"requireUser\"]`. Calling one makes a route cookie-authenticated. In a scan, `server/utils` functions that call a session reader are added automatically.",
        },
        sessionCookieSameSite: {
          type: "string",
          enum: ["strict", "lax", "none"],
          description:
            "SameSite attribute of the session cookie. In a scan it is read from `nuxt.config` (`@nuxtjs/supabase`, `nuxt-auth-utils` and `@sidebase/nuxt-auth` default to `lax`). With `lax` or `strict` nothing is reported.",
        },
        csrfProtection: {
          type: "boolean",
          description:
            "The project already rejects cross-site requests for every route. In a scan it is `true` when `nuxt-security` or `nuxt-csurf` is configured, or a `server/middleware` checks `Origin`, `Referer` or `Sec-Fetch-Site`.",
        },
        reportSameSiteLax: {
          type: "boolean",
          description:
            "Also report routes whose session cookie is `SameSite=Lax`/`Strict`, for apps whose same-site subdomains are not trusted. Default `false`.",
        },
      },
      additionalProperties: false,
    },
  },
  create: (context: RuleContext): RuleVisitors => {
    const filename = getFilename(context);
    if (!MUTATING_HANDLER_PATTERN.test(filename)) return {};
    // Webhooks and public callbacks are not called with a browser's cookies.
    if (/webhook|callback|public/i.test(filename)) return {};

    const options = getRuleOptions(context);
    if (options.csrfProtection === true) return {};
    const sameSite = typeof options.sessionCookieSameSite === "string" ? options.sessionCookieSameSite : null;
    const sameSiteProtected = sameSite === "lax" || sameSite === "strict";
    if (sameSiteProtected && options.reportSameSiteLax !== true) return {};

    const sessionFunctions = new Set([...COOKIE_SESSION_FUNCTIONS, ...getStringListOption(options, "sessionFunctions")]);
    /** Names bound to a header value, by what kind of header it is. */
    const headerNames = new Map<string, HeaderKind>();
    let usesCookieSession = false;
    let mitigated = false;
    let exportNode: EsTreeNode | null = null;

    /** The kind of header an expression reads directly: `getHeader(e, "origin")`, `event.headers.get("origin")`, a bound name. */
    const directHeaderKind = (node: EsTreeNode): HeaderKind | null => {
      const expression = peel(node);
      if (expression.type === "Identifier") return headerNames.get(expression.name) ?? null;
      if (expression.type === "CallExpression") {
        const callee = peel(expression.callee);
        if (callee.type === "Identifier" && HEADER_READERS.has(callee.name)) {
          const header = literalString(expression.arguments?.[1]);
          return header ? headerKindOf(header) : null;
        }
        if (calleeName(callee) === "get" && memberPath(callee)?.slice(-2).join(".") === "headers.get") {
          const header = literalString(expression.arguments?.[0]);
          return header ? headerKindOf(header) : null;
        }
        return null;
      }
      if (expression.type === "MemberExpression") {
        const path = memberPath(expression);
        return path && path.length >= 2 && path[path.length - 2] === "headers" ? headerKindOf(path[path.length - 1]) : null;
      }
      return null;
    };

    /** Header kinds an expression carries anywhere in it (`origin.toLowerCase()`, `Buffer.from(token)`), not looking into functions. */
    const headerKindsIn = (node: EsTreeNode | null | undefined): Set<HeaderKind> => {
      const kinds = new Set<HeaderKind>();
      if (!node) return kinds;
      const visit = (current: EsTreeNode): void => {
        walkAst(current, (child) => {
          if (child.type === "ArrowFunctionExpression" || child.type === "FunctionExpression") return WALK_SKIP;
          const kind = directHeaderKind(child);
          if (kind) kinds.add(kind);
          // Property names (`url.origin`, `{ origin: x }`) are not references to a bound name.
          if (child.type === "MemberExpression" && !child.computed) {
            visit(child.object);
            return WALK_SKIP;
          }
          if (child.type === "Property" && !child.computed) {
            visit(child.value);
            return WALK_SKIP;
          }
        });
      };
      visit(node);
      return kinds;
    };

    /** A comparison or check of header values: origin and content-type checks and header secrets all rule out a forged browser request. */
    const noteChecked = (...nodes: (EsTreeNode | null | undefined)[]): void => {
      for (const node of nodes) if (headerKindsIn(node).size > 0) mitigated = true;
    };

    return {
      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type !== "Identifier" || !node.init) return;
        const kinds = headerKindsIn(node.init);
        const [kind] = kinds;
        if (kinds.size === 1 && kind) headerNames.set(node.id.name, kind);
      },

      CallExpression(node: EsTreeNode) {
        const callee = peel(node.callee);
        const name = calleeName(callee);
        if (!name) return;
        if (callee.type === "Identifier" && sessionFunctions.has(name)) usesCookieSession = true;
        if (CSRF_GUARD_PATTERN.test(name) || SIGNATURE_VERIFIER_PATTERN.test(name)) mitigated = true;
        else if (callee.type === "MemberExpression" && TEST_METHODS.has(name)) noteChecked(callee.object, node.arguments?.[0]);
        else if (CHECK_CALL_PATTERN.test(name)) noteChecked(...(node.arguments as EsTreeNode[]));
      },

      BinaryExpression(node: EsTreeNode) {
        if (COMPARISON_OPERATORS.has(node.operator)) noteChecked(node.left, node.right);
      },

      ExportDefaultDeclaration(node: EsTreeNode) {
        exportNode = node;
      },

      "Program:exit"() {
        if (!usesCookieSession || mitigated || !exportNode) return;
        const cookie =
          sameSite === "none"
            ? "the session cookie is SameSite=None"
            : sameSiteProtected
              ? `SameSite=${sameSite === "lax" ? "Lax" : "Strict"} blocks cross-site requests, but not those from same-site subdomains`
              : "nothing shows the session cookie is SameSite";
        context.report({
          node: exportNode,
          message: `mutating endpoint authenticates with a session cookie and has no CSRF, Origin or content-type check (${cookie}) — reject cross-site requests in a server middleware or check the Origin header`,
        });
      },
    };
  },
});
