import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import { peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const MUTATING_HANDLER_PATTERN = /(?:^|\/)server\/api\/.*\.(?:post|put|patch|delete)\.[cm]?[jt]s$/i;
const CSRF_CHECK_PATTERN = /csrf|origin|referer|verifytoken|protect/i;

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
    help: "Protect state-changing (mutating) API endpoints against Cross-Site Request Forgery (CSRF)",
    agentGuidance:
      "Mutating endpoints (`.post`, `.put`, `.patch`, `.delete`) that authenticate via cookies are vulnerable to CSRF if requests from third-party sites are accepted. " +
      "Verify the `Origin` / `Referer` header matches your site origin, use a CSRF token (or `nuxt-csurf` / `nuxt-security`), or ensure session cookies use `SameSite: Strict` or `Lax`.",
  },
  create: (context: RuleContext): RuleVisitors => {
    const filename = getFilename(context);
    if (!MUTATING_HANDLER_PATTERN.test(filename)) return {};

    // Webhooks, public callbacks, or static paths usually don't use ambient browser cookies
    if (/webhook|callback|public/i.test(filename)) return {};

    let hasCsrfOrOriginCheck = false;
    let exportNode: EsTreeNode | null = null;
    let readsBodyOrCookie = false;

    return {
      CallExpression(node: EsTreeNode) {
        const callee = peel(node.callee);
        const name =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier"
              ? callee.property.name
              : null;

        if (name && CSRF_CHECK_PATTERN.test(name)) {
          hasCsrfOrOriginCheck = true;
        }

        if (
          name &&
          (name === "getHeader" || name === "getRequestHeader") &&
          (node.arguments as EsTreeNode[]).some(
            (arg) => arg.type === "Literal" && typeof arg.value === "string" && CSRF_CHECK_PATTERN.test(arg.value),
          )
        ) {
          hasCsrfOrOriginCheck = true;
        }

        if (
          name &&
          (name === "readBody" ||
            name === "readValidatedBody" ||
            name === "readFormData" ||
            name === "readMultipartFormData" ||
            name === "getCookie")
        ) {
          readsBodyOrCookie = true;
        }
      },

      MemberExpression(node: EsTreeNode) {
        if (!node.computed && node.property?.type === "Identifier") {
          if (CSRF_CHECK_PATTERN.test(node.property.name)) {
            hasCsrfOrOriginCheck = true;
          }
        }
      },

      ExportDefaultDeclaration(node: EsTreeNode) {
        exportNode = node;
      },

      "Program:exit"() {
        if (readsBodyOrCookie && !hasCsrfOrOriginCheck && exportNode) {
          context.report({
            node: exportNode,
            message: `mutating endpoint modifies state from request body or cookies without an explicit CSRF or Origin check — verify Origin header or use a CSRF token`,
          });
        }
      },
    };
  },
});
