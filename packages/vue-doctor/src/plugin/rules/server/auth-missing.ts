import { defineRule } from "../../define-rule.js";
import { getFilename, getRuleOptions, getStringListOption } from "../../helpers.js";
import { AUTH_HELPER_NAME } from "../../server-auth.js";
import { memberPath, peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const ADMIN_ROUTE_PATTERN = /(?:^|\/)server\/api\/admin\//i;
const MUTATING_HANDLER_PATTERN = /(?:^|\/)server\/api\/.*\.(?:post|put|patch|delete)\.[cm]?[jt]s$/i;

const AUTH_CALL_PATTERN = /auth|session|user|token|login|jwt|guard|permission|role/i;
/** Session state a server middleware put on the event: `event.context.user`, `e.context.auth`. */
const CONTEXT_AUTH_PROPERTIES: ReadonlySet<string> = new Set(["user", "auth", "session"]);

export default defineRule({
  meta: {
    id: "auth-missing",
    category: "Server",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["nuxt"],
    cwe: ["CWE-862"],
    owasp: "A01:2021",
    fixable: false,
    since: "2.0.0",
    help: "Ensure sensitive, admin, or mutating server routes verify authentication or authorization",
    agentGuidance:
      "Admin routes (`server/api/admin/**`) and mutating endpoints (`.post`, `.put`, `.delete`, `.patch`) should enforce an authentication check " +
      "(e.g. `await requireUserSession(event)`, `await getServerSession(event)`, or custom middleware setting `event.context.auth`). " +
      "Guards named like `requireAdmin`/`ensureUser`/`assertOrgMember`, and `server/utils` functions that read the session and throw a 401/403, are recognised; " +
      "list other project guards in the rule's `authFunctions` option. " +
      "If the endpoint is intentionally public (such as `login.post.ts` or `register.post.ts`), suppress this advisory with `// vue-doctor-disable-next-line`.",
    options: {
      type: "object",
      properties: {
        authFunctions: {
          type: "array",
          items: { type: "string" },
          description:
            "Names of project functions that authenticate the request, e.g. `[\"ensureAdmin\"]`. Calling one counts as an auth check. In a scan, `server/utils` functions that read the session and throw a 401/403 are added automatically.",
        },
      },
      additionalProperties: false,
    },
  },
  create: (context: RuleContext): RuleVisitors => {
    const filename = getFilename(context);
    const isAdmin = ADMIN_ROUTE_PATTERN.test(filename);
    const isMutating = MUTATING_HANDLER_PATTERN.test(filename);

    if (!isAdmin && !isMutating) return {};

    // Skip standard public endpoints like login, register, forgot-password, oauth
    if (/login|register|signup|forgot-password|reset-password|callback|webhook/i.test(filename)) {
      return {};
    }

    const authFunctions = new Set(getStringListOption(getRuleOptions(context), "authFunctions"));
    let hasAuthCheck = false;
    let exportNode: EsTreeNode | null = null;

    return {
      CallExpression(node: EsTreeNode) {
        const callee = peel(node.callee);
        const name =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier"
              ? callee.property.name
              : null;
        if (name && (authFunctions.has(name) || AUTH_HELPER_NAME.test(name) || AUTH_CALL_PATTERN.test(name))) {
          hasAuthCheck = true;
        }
      },

      MemberExpression(node: EsTreeNode) {
        const path = memberPath(node);
        if (path && path.length >= 3 && path[1] === "context" && CONTEXT_AUTH_PROPERTIES.has(path[2])) hasAuthCheck = true;
      },

      ExportDefaultDeclaration(node: EsTreeNode) {
        exportNode = node;
      },

      "Program:exit"() {
        if (!hasAuthCheck && exportNode) {
          context.report({
            node: exportNode,
            message: `admin or mutating server route has no apparent authentication or authorization check — verify user session or suppress if intentionally public`,
          });
        }
      },
    };
  },
});
