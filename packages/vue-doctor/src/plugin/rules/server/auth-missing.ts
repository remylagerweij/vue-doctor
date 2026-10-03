import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import { peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const ADMIN_ROUTE_PATTERN = /(?:^|\/)server\/api\/admin\//i;
const MUTATING_HANDLER_PATTERN = /(?:^|\/)server\/api\/.*\.(?:post|put|patch|delete)\.[cm]?[jt]s$/i;

const AUTH_CHECK_PATTERN = /auth|session|user|token|login|jwt|guard|permission|role/i;

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
      "If the endpoint is intentionally public (such as `login.post.ts` or `register.post.ts`), suppress this advisory with `// vue-doctor-disable-next-line`.",
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
        if (name && AUTH_CHECK_PATTERN.test(name)) {
          hasAuthCheck = true;
        }
      },

      MemberExpression(node: EsTreeNode) {
        if (!node.computed && node.property?.type === "Identifier") {
          if (AUTH_CHECK_PATTERN.test(node.property.name)) {
            hasAuthCheck = true;
          }
        }
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
