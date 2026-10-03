import { defineRule } from "../../define-rule.js";
import {
  USER_CONTROLLED_URL_MESSAGE,
  isUrlAttributeName,
  isUserControlledUrl,
  memberPath,
  taintedNamesBoundBy,
  urlExpressionKey,
  validatedUrlKeys,
} from "../../url-sinks.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

/** Global objects whose `.open(url)` and `.location` navigate. */
const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(["window", "globalThis", "self", "top", "parent"]);
const LOCATION_NAVIGATION_METHODS: ReadonlySet<string> = new Set(["assign", "replace"]);

const propertyName = (member: EsTreeNode): string | null => {
  if (member.type !== "MemberExpression") return null;
  if (!member.computed) return member.property?.type === "Identifier" ? member.property.name : null;
  return member.property?.type === "Literal" && typeof member.property.value === "string" ? member.property.value : null;
};

/** `location`, `window.location`, `document.location`: the navigation target itself. */
const isLocationObject = (node: EsTreeNode): boolean => {
  const path = memberPath(node);
  if (!path) return false;
  if (path.length === 1) return path[0] === "location";
  return path.length === 2 && path[1] === "location" && (GLOBAL_OBJECTS.has(path[0]) || path[0] === "document");
};

export default defineRule({
  meta: {
    id: "no-user-controlled-url",
    category: "Security",
    // Warning, medium confidence: the source is user input, but the single-function analysis cannot
    // see every validation, and many apps do validate elsewhere (a router guard, a server redirect).
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-79", "CWE-601"],
    owasp: "A03:2021",
    fixable: false,
    since: "2.0.0",
    help: "Validate the URL before navigating: parse it with `new URL(value, location.origin)` and allow only `http:`/`https:` on your own origin",
    agentGuidance:
      "Never assign a route query/param, `location.hash`/`location.search` or `window.name` value straight to `location.href`, `location.assign/replace`, " +
      "`window.open`, an `<a>`'s `href`, or `src`/`action`. Parse it first: `const url = new URL(value, location.origin)` and accept it only when " +
      "`url.origin === location.origin` (or the host is on an allowlist) and `url.protocol` is `http:` or `https:`; otherwise fall back to `/`. " +
      "For in-app navigation pass a path to `router.push`. A sanitizer or validator call (`sanitizeUrl(x)`, `isSafeUrl(x)`) next to the sink silences the finding.",
  },
  create: (context: RuleContext) => {
    // Names bound to user input, and expression keys (`next`, `route.query.next`) the code validates.
    const tainted = new Set<string>();
    const validated = new Set<string>();

    const report = (node: EsTreeNode, sink: string, value: EsTreeNode): void => {
      if (!isUserControlledUrl(value, tainted)) return;
      const key = urlExpressionKey(value);
      if (key && validated.has(key)) return;
      context.report({ node, message: `${sink} receives a user-controlled URL — ${USER_CONTROLLED_URL_MESSAGE}` });
    };

    return {
      VariableDeclarator(node: EsTreeNode) {
        for (const name of taintedNamesBoundBy(node, tainted)) tainted.add(name);
      },

      NewExpression(node: EsTreeNode) {
        for (const key of validatedUrlKeys(node)) validated.add(key);
      },

      AssignmentExpression(node: EsTreeNode) {
        if (node.operator !== "=") return;
        const left: EsTreeNode = node.left;
        // `location = x` / `window.location = x`
        if (isLocationObject(left)) return report(node, "navigation (`location = …`)", node.right);
        const property = propertyName(left);
        if (!isUrlAttributeName(property)) return;
        report(node, `\`${property}\` assignment`, node.right);
      },

      CallExpression(node: EsTreeNode) {
        for (const key of validatedUrlKeys(node)) validated.add(key);

        const callee: EsTreeNode | undefined = node.callee;
        if (callee?.type !== "MemberExpression") return;
        const method = propertyName(callee);
        const [first, second] = node.arguments as EsTreeNode[];
        if (!method || !first) return;

        // `location.assign(x)` / `location.replace(x)`
        if (LOCATION_NAVIGATION_METHODS.has(method) && isLocationObject(callee.object)) {
          return report(node, `\`location.${method}()\``, first);
        }
        // `window.open(x)`
        const receiver = memberPath(callee.object);
        if (method === "open" && receiver?.length === 1 && GLOBAL_OBJECTS.has(receiver[0])) {
          return report(node, "`window.open()`", first);
        }
        // `a.setAttribute("href", x)`
        if (method === "setAttribute" && second && first.type === "Literal" && typeof first.value === "string" && isUrlAttributeName(first.value)) {
          report(node, `\`setAttribute("${first.value}")\``, second);
        }
      },
    };
  },
});
