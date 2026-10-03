import type { EsTreeNode } from "../../types.js";

/**
 * Shared by the script rule (`no-unsafe-html-sink`, oxlint) and its template counterpart (ESLint),
 * so both engines agree on what counts as "known safe" HTML.
 */

/**
 * Functions whose result is safe to render as HTML: HTML sanitizers (DOMPurify, sanitize-html,
 * js-xss, AngularJS-style `$sanitize`) and HTML escapers. Matched on the called name, whether it is
 * a bare call (`sanitizeHtml(x)`) or a method (`DOMPurify.sanitize(x)`, `this.$sanitize(x)`).
 * A variable that merely has a "safe-sounding" name is never trusted; only a call is.
 */
const SANITIZER_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  "sanitize",
  "sanitizehtml",
  "$sanitize",
  "filterxss",
  "escapehtml",
  "xss",
]);

/** Receivers for which any method call is a sanitizer call (`DOMPurify.sanitize`, `DOMPurify.default.sanitize`...). */
const SANITIZER_RECEIVER_NAMES: ReadonlySet<string> = new Set(["dompurify", "purify", "sanitizer", "xss"]);

/** Wrappers that do not change the value: `(x)`, `x as string`, `x!`. */
const TRANSPARENT_WRAPPERS = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSSatisfiesExpression",
]);

const unwrap = (node: EsTreeNode): EsTreeNode => {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type) && current.expression) current = current.expression;
  return current;
};

const calleeName = (callee: EsTreeNode): string | null => {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
    return callee.property.name;
  }
  return null;
};

const receiverName = (callee: EsTreeNode): string | null => {
  if (callee.type !== "MemberExpression") return null;
  const object = unwrap(callee.object);
  if (object.type === "Identifier") return object.name;
  // `DOMPurify.default.sanitize(...)` / `window.DOMPurify.sanitize(...)`
  if (object.type === "MemberExpression" && !object.computed && object.property?.type === "Identifier") {
    return object.property.name;
  }
  return null;
};

export const isSanitizerCall = (node: EsTreeNode): boolean => {
  const call = unwrap(node);
  // Optional call chains (`DOMPurify?.sanitize(x)`) wrap the call in a ChainExpression.
  if (call.type === "ChainExpression") return isSanitizerCall(call.expression);
  if (call.type !== "CallExpression") return false;
  const callee = unwrap(call.callee);
  const name = calleeName(callee);
  if (!name) return false;
  if (SANITIZER_FUNCTION_NAMES.has(name.toLowerCase())) return true;
  const receiver = receiverName(callee);
  return receiver !== null && SANITIZER_RECEIVER_NAMES.has(receiver.toLowerCase());
};

/**
 * Whether an expression can only produce markup the author wrote or a sanitizer produced:
 * string/number literals, templates without interpolation, sanitizer calls, and combinations of
 * those (`cond ? sanitize(a) : ""`, `"<b>" + sanitize(a) + "</b>"`).
 * `trustedNames` are `const` bindings the caller saw initialised with a safe expression.
 */
export const isKnownSafeHtml = (node: EsTreeNode | null | undefined, trustedNames?: ReadonlySet<string>): boolean => {
  if (!node) return true;
  const expression = unwrap(node);
  switch (expression.type) {
    case "Literal":
      return true;
    case "TemplateLiteral":
      return (expression.expressions as EsTreeNode[]).every((part) => isKnownSafeHtml(part, trustedNames));
    case "CallExpression":
    case "ChainExpression":
      return isSanitizerCall(expression);
    case "MemberExpression": {
      // `safeHtml.value` of a trusted `computed(() => sanitize(...))`.
      const object = unwrap(expression.object);
      return (
        !expression.computed &&
        expression.property?.name === "value" &&
        object.type === "Identifier" &&
        Boolean(trustedNames?.has(object.name))
      );
    }
    case "Identifier":
      // `undefined` clears the content; anything else is trusted only when bound to a safe const.
      return expression.name === "undefined" || Boolean(trustedNames?.has(expression.name));
    case "ConditionalExpression":
      return isKnownSafeHtml(expression.consequent, trustedNames) && isKnownSafeHtml(expression.alternate, trustedNames);
    case "LogicalExpression":
      // `a && b` yields `a` (falsy, so no markup) or `b`; `a || b` / `a ?? b` can yield either operand.
      return expression.operator === "&&"
        ? isKnownSafeHtml(expression.right, trustedNames)
        : isKnownSafeHtml(expression.left, trustedNames) && isKnownSafeHtml(expression.right, trustedNames);
    case "BinaryExpression":
      return (
        expression.operator === "+" &&
        isKnownSafeHtml(expression.left, trustedNames) &&
        isKnownSafeHtml(expression.right, trustedNames)
      );
    default:
      return false;
  }
};

/**
 * Whether a `const` initialiser makes its binding trustworthy: a safe expression, or
 * `computed(() => <safe expression>)` (read back as `name.value`).
 */
export const isTrustedInitializer = (init: EsTreeNode | null | undefined, trustedNames: ReadonlySet<string>): boolean => {
  if (!init) return false;
  if (isKnownSafeHtml(init, trustedNames)) return true;
  const call = unwrap(init);
  if (call.type !== "CallExpression" || call.callee?.type !== "Identifier" || call.callee.name !== "computed") return false;
  const getter = call.arguments?.[0];
  if (getter?.type !== "ArrowFunctionExpression" || getter.async || getter.body?.type === "BlockStatement") return false;
  return isKnownSafeHtml(getter.body, trustedNames);
};

/** Property names that inject HTML when set on an element (`el.innerHTML = x`, `h("div", { innerHTML: x })`). */
export const HTML_INJECTION_PROPERTIES: ReadonlySet<string> = new Set(["innerHTML", "outerHTML"]);

export const UNSAFE_HTML_MESSAGE =
  "an XSS risk; sanitize it with DOMPurify, or render text with `{{ }}` / `textContent`";
