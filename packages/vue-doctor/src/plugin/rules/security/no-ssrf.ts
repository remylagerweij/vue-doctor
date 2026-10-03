import { getFilename } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import { createInputTracker, isServerFile, withInputTracker } from "../../server-input.js";
import { peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

/** Request functions whose first argument is the URL (`$fetch(url)`, `ofetch(url)`, `fetch(url)`, `axios(url)`, `got(url)`...). */
const REQUEST_FUNCTIONS: ReadonlySet<string> = new Set(["$fetch", "ofetch", "fetch", "axios", "got", "ky"]);
/** Methods of those clients that take the URL first: `$fetch.raw(url)`, `axios.get(url)`, `got.post(url)`. */
const REQUEST_METHODS: ReadonlySet<string> = new Set(["raw", "get", "post", "put", "patch", "delete", "head", "request"]);
/** h3 helpers that forward the request to a target URL: `proxyRequest(event, target)`, `sendProxy(event, target)`. */
const PROXY_FUNCTIONS: ReadonlySet<string> = new Set(["proxyRequest", "sendProxy"]);
/** Options that carry the URL or its origin: `axios({ url })`, `$fetch(path, { baseURL })`. */
const URL_OPTIONS: ReadonlySet<string> = new Set(["url", "baseURL"]);

const propertyKey = (property: EsTreeNode): string | null => {
  if (property.type !== "Property" || property.computed) return null;
  if (property.key?.type === "Identifier") return property.key.name;
  return property.key?.type === "Literal" && typeof property.key.value === "string" ? property.key.value : null;
};

/** The expressions of a call that choose where the request goes. */
const urlArguments = (node: EsTreeNode): EsTreeNode[] => {
  const callee = peel(node.callee);
  const args = node.arguments as EsTreeNode[];
  let isRequest = false;
  let isProxy = false;
  if (callee.type === "Identifier") {
    isRequest = REQUEST_FUNCTIONS.has(callee.name);
    isProxy = PROXY_FUNCTIONS.has(callee.name);
  } else if (callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
    const receiver = peel(callee.object);
    isRequest = receiver.type === "Identifier" && REQUEST_FUNCTIONS.has(receiver.name) && REQUEST_METHODS.has(callee.property.name);
  }
  if (isProxy) return args.slice(1, 2);
  if (!isRequest) return [];
  const urls: EsTreeNode[] = args.slice(0, 1);
  // `axios({ url })` and `$fetch(path, { baseURL })`: the URL can also live in the options.
  for (const argument of args.slice(0, 2)) {
    if (argument.type !== "ObjectExpression") continue;
    for (const property of argument.properties as EsTreeNode[]) {
      const key = propertyKey(property);
      if (key && URL_OPTIONS.has(key)) urls.push(property.value);
    }
  }
  return urls;
};

export default defineRule({
  meta: {
    id: "no-ssrf",
    category: "Security",
    // Warning, medium confidence: the source is request input and the sink is a server-side request,
    // but the analysis stays inside one function and cannot see a validation done in a helper or middleware.
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    cwe: ["CWE-918"],
    owasp: "A10:2021",
    fixable: false,
    since: "2.0.0",
    help: "Never fetch a URL taken from the request as is: parse it with `new URL()` and compare the host with an allowlist, or build the URL from a fixed base and a validated path",
    agentGuidance:
      "A `$fetch`/`ofetch`/`fetch`/`axios`/`proxyRequest` URL that starts with a value from `getQuery`, `readBody`, `getRouterParam`, `getHeader` or `event.context.params` lets an attacker make the server call internal services " +
      "(cloud metadata at 169.254.169.254, localhost admin ports). Fix it by (1) keeping the host fixed and only interpolating a validated path segment (`$fetch(`${config.apiBase}/users/${id}`)` with `id` validated by `getValidatedRouterParams`), or " +
      "(2) parsing the value with `new URL(value)` and requiring `url.protocol === 'https:'` and `allowedHosts.includes(url.hostname)` before the request; never an `includes`/`startsWith` check on the raw string, and block private IP ranges when the allowlist cannot be fixed. " +
      "A validator call (`assertAllowedUrl(x)`, `schema.parse(x)`) or an allowlist/comparison check on the value before the call silences the finding.",
  },
  create: (context: RuleContext) => {
    if (!isServerFile(getFilename(context))) return {};
    const tracker = createInputTracker({ parsedUrlIsCheck: false });
    return withInputTracker(tracker, {
      CallExpression(node: EsTreeNode) {
        for (const url of urlArguments(node)) {
          if (!tracker.isUnsafe(url)) continue;
          context.report({
            node,
            message:
              "request URL comes from request input without validation (SSRF) — parse it with `new URL()` and compare the host with an allowlist, or keep the host fixed and only interpolate a validated path",
          });
          return;
        }
      },
    });
  },
});
