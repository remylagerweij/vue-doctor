import { defineRule } from "../../define-rule.js";
import { getFilename } from "../../helpers.js";
import { isServerFile } from "../../server-input.js";
import { peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const SENSITIVE_COOKIE_NAME = /session|token|auth|jwt|sid|login|credential|access/i;

const isSensitiveCookieName = (node: EsTreeNode | undefined): boolean => {
  if (!node) return false;
  const expr = peel(node);
  if (expr.type === "Literal" && typeof expr.value === "string") {
    return SENSITIVE_COOKIE_NAME.test(expr.value);
  }
  if (expr.type === "Identifier") {
    return SENSITIVE_COOKIE_NAME.test(expr.name);
  }
  return false;
};

interface CookieFlags {
  hasHttpOnly: boolean;
  hasSecure: boolean;
  hasSameSite: boolean;
}

const checkOptions = (options: EsTreeNode | undefined): CookieFlags => {
  const flags: CookieFlags = { hasHttpOnly: false, hasSecure: false, hasSameSite: false };
  if (!options || options.type !== "ObjectExpression") return flags;

  for (const prop of options.properties as EsTreeNode[]) {
    if (prop.type !== "Property" || prop.computed) continue;
    const key = prop.key?.type === "Identifier" ? prop.key.name : prop.key?.value;
    const val = peel(prop.value);

    if (key === "httpOnly") {
      if (val.type !== "Literal" || val.value !== false) flags.hasHttpOnly = true;
    } else if (key === "secure") {
      if (val.type !== "Literal" || val.value !== false) flags.hasSecure = true;
    } else if (key === "sameSite") {
      if (val.type === "Literal" && typeof val.value === "string") {
        const s = val.value.toLowerCase();
        if (s === "lax" || s === "strict" || s === "none") flags.hasSameSite = true;
      } else if (val.type !== "Literal" || val.value !== false) {
        flags.hasSameSite = true;
      }
    }
  }
  return flags;
};

export default defineRule({
  meta: {
    id: "secure-cookie-flags",
    category: "Server",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    cwe: ["CWE-614", "CWE-1004"],
    owasp: "A05:2021",
    fixable: false,
    since: "2.0.0",
    help: "Set `httpOnly: true`, `secure: true`, and `sameSite: 'lax'` (or `'strict'`) on sensitive authentication/session cookies",
    agentGuidance:
      "When setting sensitive cookies with `setCookie(event, name, value, options)` in Nuxt server handlers, always set `httpOnly: true` (prevents XSS theft), " +
      "`secure: true` (or `process.env.NODE_ENV === 'production'`) and `sameSite: 'lax'` or `'strict'` (prevents CSRF). For client-readable non-sensitive cookies (e.g. UI theme preference), " +
      "this rule will not trigger if the name does not match auth/session keywords.",
  },
  create: (context: RuleContext): RuleVisitors => {
    if (!isServerFile(getFilename(context))) return {};

    return {
      CallExpression(node: EsTreeNode) {
        const callee = peel(node.callee);
        const calleeName =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier"
              ? callee.property.name
              : null;

        if (calleeName !== "setCookie") return;

        const args = node.arguments as EsTreeNode[];
        // setCookie(event, name, value, options)
        const nameArg = args[1];
        if (!isSensitiveCookieName(nameArg)) return;

        const optionsArg = args[3];
        const flags = checkOptions(optionsArg);

        const missing: string[] = [];
        if (!flags.hasHttpOnly) missing.push("httpOnly");
        if (!flags.hasSecure) missing.push("secure");
        if (!flags.hasSameSite) missing.push("sameSite");

        if (missing.length > 0) {
          context.report({
            node,
            message: `sensitive cookie set without required security flags: ${missing.join(", ")} — set httpOnly: true, secure: true, and sameSite: 'lax'|'strict'`,
          });
        }
      },
    };
  },
});
