import type { EsTreeNode } from "./types.js";

/**
 * Name heuristics for credentials, shared by `no-token-in-web-storage` and `postmessage-origin-check`.
 * Names are split into words (`accessToken`, `ACCESS_TOKEN` and `access-token` all give `access`,
 * `token`) so that `tokenizer`, `authenticated` or `author` are not mistaken for credentials.
 */

const SENSITIVE_WORDS: ReadonlySet<string> = new Set([
  "token", "jwt", "bearer", "session", "auth", "oauth", "authorization", "credential", "credentials",
  "secret", "password", "passwd", "cookie", "apikey", "otp",
]);

/** Words that turn "token" into something harmless: CSRF tokens are meant to be readable by scripts, design tokens are styling. */
const BENIGN_WORDS: ReadonlySet<string> = new Set(["csrf", "xsrf", "design", "theme", "css", "style", "color", "spacing", "font"]);

export const nameWords = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** Whether a variable, property or storage key name looks like it holds a credential. */
export const isSensitiveName = (name: string): boolean => {
  const words = nameWords(name);
  if (words.some((word) => BENIGN_WORDS.has(word))) return false;
  if (words.some((word) => SENSITIVE_WORDS.has(word))) return true;
  const compact = words.join("");
  return compact.includes("apikey") || compact.includes("privatekey") || compact.includes("accesskey");
};

const TRANSPARENT_WRAPPERS = new Set(["ParenthesizedExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "ChainExpression"]);

/**
 * Names an expression is written with: identifiers, property names, object keys, string literals and
 * template text, anywhere inside it (`{ type: "login", accessToken: res.data.token }`).
 */
const collect = (node: EsTreeNode | null | undefined, names: string[], depth: number, literals: boolean): string[] => {
  if (!node || depth > 8) return names;
  switch (node.type) {
    case "Identifier":
      names.push(node.name);
      break;
    case "Literal":
      if (literals && typeof node.value === "string") names.push(node.value);
      break;
    case "TemplateLiteral":
      if (literals) for (const quasi of node.quasis as EsTreeNode[]) names.push(quasi.value?.cooked ?? "");
      for (const part of node.expressions as EsTreeNode[]) collect(part, names, depth + 1, literals);
      break;
    case "MemberExpression":
      collect(node.object, names, depth + 1, literals);
      collect(node.property, names, depth + 1, literals);
      break;
    case "ObjectExpression":
      for (const property of node.properties as EsTreeNode[]) {
        if (property.type !== "Property") continue;
        // Keys are names even when written as strings (`{ "access-token": x }`).
        if (!property.computed) collect(property.key, names, depth + 1, true);
        collect(property.value, names, depth + 1, literals);
      }
      break;
    case "ArrayExpression":
      for (const element of node.elements as EsTreeNode[]) collect(element, names, depth + 1, literals);
      break;
    case "CallExpression":
      collect(node.callee, names, depth + 1, literals);
      for (const argument of node.arguments as EsTreeNode[]) collect(argument, names, depth + 1, literals);
      break;
    case "BinaryExpression":
    case "LogicalExpression":
      collect(node.left, names, depth + 1, literals);
      collect(node.right, names, depth + 1, literals);
      break;
    case "ConditionalExpression":
      collect(node.consequent, names, depth + 1, literals);
      collect(node.alternate, names, depth + 1, literals);
      break;
    default:
      if (TRANSPARENT_WRAPPERS.has(node.type)) collect(node.expression, names, depth + 1, literals);
  }
  return names;
};

/** Names inside an expression. `literals: false` ignores string values (only identifiers, properties and object keys). */
export const collectNames = (node: EsTreeNode | null | undefined, { literals = true } = {}): string[] =>
  collect(node, [], 0, literals);
