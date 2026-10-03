import { defineRule } from "../../define-rule.js";
import { createInputTracker, withInputTracker } from "../../server-input.js";
import { peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const calleeName = (node: EsTreeNode): string | null => {
  const callee = peel(node.callee);
  if (callee.type === "Identifier") return callee.name;
  return callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier" ? callee.property.name : null;
};

/** Whether the options of `navigateTo(to, { external: true })` allow leaving the site. Only a literal `false` is safe. */
const allowsExternal = (options: EsTreeNode | undefined): boolean => {
  if (options?.type !== "ObjectExpression") return false;
  return (options.properties as EsTreeNode[]).some(
    (property) =>
      property.type === "Property" &&
      !property.computed &&
      (property.key?.name === "external" || property.key?.value === "external") &&
      !(property.value?.type === "Literal" && property.value.value === false),
  );
};

/** Header setters whose `Location` value redirects: `setResponseHeader(event, "Location", x)`, `res.setHeader("location", x)`. */
const HEADER_SETTERS: ReadonlySet<string> = new Set(["setResponseHeader", "setHeader", "appendResponseHeader", "appendHeader"]);

const isLocationName = (node: EsTreeNode | undefined): boolean =>
  node?.type === "Literal" && typeof node.value === "string" && node.value.toLowerCase() === "location";

/** The expressions a call redirects to; empty when the call is not a redirect sink. */
const redirectTargets = (node: EsTreeNode): EsTreeNode[] => {
  const name = calleeName(node);
  const args = node.arguments as EsTreeNode[];
  if (!name) return [];
  // `sendRedirect(event, to)` (h3 1), `redirect(event, to)` / `redirect(to)` (h3 2), `Response.redirect(to)`.
  if (name === "sendRedirect") return args.slice(1, 2);
  if (name === "redirect") return args.slice(0, 2);
  // `navigateTo(to, { external: true })`: without `external` an absolute URL is refused, so only the external form is open.
  if (name === "navigateTo") return allowsExternal(args[1]) ? args.slice(0, 1) : [];
  if (HEADER_SETTERS.has(name)) {
    const nameIndex = args.findIndex(isLocationName);
    return nameIndex >= 0 && args[nameIndex + 1] ? [args[nameIndex + 1]] : [];
  }
  return [];
};

export default defineRule({
  meta: {
    id: "no-open-redirect",
    category: "Security",
    // Warning, medium confidence: the single-function analysis cannot see a validation done in a
    // route middleware or helper, and `?next=` flows are often checked where the value is read.
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    cwe: ["CWE-601"],
    owasp: "A01:2021",
    fixable: false,
    since: "2.0.0",
    help: "Redirect only to relative paths or allow-listed hosts: check `value.startsWith('/') && !value.startsWith('//')`, or parse it with `new URL(value, origin)` and compare the origin",
    agentGuidance:
      "Never pass a query parameter, body field or route param straight to `sendRedirect(event, x)`, `navigateTo(x, { external: true })` or a `Location` header: an attacker links to your site with `?next=https://evil.example` " +
      "and uses your domain for phishing. Accept only a relative path (`next.startsWith('/') && !next.startsWith('//')`) or parse it with `new URL(next, requestOrigin)` and require `url.origin === requestOrigin` " +
      "(or the host on an allowlist), and fall back to `/` otherwise. A redirect to a fixed path with the value only in the query string (`/login?next=${next}`) is fine. " +
      "A validator call (`isSafeRedirect(x)`) or a prefix/origin check on the value before the call silences the finding.",
  },
  create: (context: RuleContext) => {
    // Route sources (`route.query.next`) apply in app code, request readers (`getQuery(event)`) in server code.
    const tracker = createInputTracker({ parsedUrlIsCheck: true });
    return withInputTracker(tracker, {
      CallExpression(node: EsTreeNode) {
        for (const target of redirectTargets(node)) {
          if (!tracker.isUnsafe(target)) continue;
          context.report({
            node,
            message:
              "redirect target comes from user input without validation (open redirect) — allow only relative paths (`/x`, not `//x`) or allow-listed hosts",
          });
          return;
        }
      },
    });
  },
});
