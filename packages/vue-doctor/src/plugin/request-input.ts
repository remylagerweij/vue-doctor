import type { EsTreeNode } from "./types.js";

/**
 * Request-input taint for server code, shared by the injection, prototype-pollution and LLM
 * prompt-injection rules. A value is "request input" when it comes from an h3/Nitro reader
 * (`readBody(event)`, `getQuery(event)`, `getRouterParam(event, "id")`, ...), from an Express-style
 * `req.body` / `req.query` / `req.params`, or from a name bound to one of those. Validated readers
 * (`readValidatedBody`, `getValidatedQuery`) are deliberately not sources: their result went through a schema.
 *
 * The analysis is intra-file and flow-insensitive: names are collected as the declarations are visited.
 */

/** h3 / Nitro functions that return data the client controls. */
const REQUEST_READERS: ReadonlySet<string> = new Set([
  "readBody",
  "readRawBody",
  "readFormData",
  "readMultipartFormData",
  "getQuery",
  "getRouterParam",
  "getRouterParams",
  "getHeader",
  "getHeaders",
  "getRequestHeader",
  "getRequestHeaders",
  "getCookie",
  "parseCookies",
]);

/** Receivers of Express/Fastify/Koa style requests, and the properties on them that carry client data. */
const REQUEST_OBJECTS: ReadonlySet<string> = new Set(["req", "request"]);
const REQUEST_PROPERTIES: ReadonlySet<string> = new Set(["body", "query", "params", "headers", "cookies"]);

/** Wrappers that keep the value of their operand: `(x)`, `x as T`, `x!`, `x?.y`, `await x`. */
const TRANSPARENT_WRAPPERS: ReadonlySet<string> = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSSatisfiesExpression",
  "ChainExpression",
  "AwaitExpression",
]);

/** Functions and methods that return (a transformation of) their input text or structure. */
const PASSTHROUGH_FUNCTIONS: ReadonlySet<string> = new Set(["String", "decodeURIComponent", "decodeURI", "unescape", "atob"]);
const PASSTHROUGH_METHODS: ReadonlySet<string> = new Set([
  "slice", "substring", "substr", "trim", "trimStart", "trimEnd", "toString", "toLowerCase", "toUpperCase",
  "replace", "replaceAll", "at", "normalize", "concat", "split", "join", "map", "filter", "flat",
]);

export const peel = (node: EsTreeNode): EsTreeNode => {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type)) {
    const inner: EsTreeNode | undefined = current.expression ?? current.argument;
    if (!inner) break;
    current = inner;
  }
  return current;
};

/** The identifier names a destructuring pattern binds (`{ a, b: c, ...rest }` gives `a`, `c`, `rest`). */
const patternNames = (pattern: EsTreeNode | null | undefined): string[] => {
  if (!pattern) return [];
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "AssignmentPattern":
      return patternNames(pattern.left);
    case "RestElement":
      return patternNames(pattern.argument);
    case "ObjectPattern":
      return (pattern.properties as EsTreeNode[]).flatMap((property) =>
        property.type === "Property" ? patternNames(property.value) : patternNames(property),
      );
    case "ArrayPattern":
      return (pattern.elements as (EsTreeNode | null)[]).flatMap((element) => patternNames(element));
    default:
      return [];
  }
};

export interface RequestInputTracker {
  /** Whether the expression is (or is derived from) request input. */
  isInput: (node: EsTreeNode | null | undefined) => boolean;
  /** Record names bound by `const x = <input>` / `const { a } = <input>`. Call from `VariableDeclarator`. */
  recordDeclarator: (declarator: EsTreeNode) => void;
  /** Record `x = <input>`. Call from `AssignmentExpression`. */
  recordAssignment: (assignment: EsTreeNode) => void;
  /** Mark names as input directly (a `for (const key in <input>)` loop variable). */
  addNames: (names: readonly string[]) => void;
}

export const createRequestInputTracker = (): RequestInputTracker => {
  const names = new Set<string>();

  const isInput = (node: EsTreeNode | null | undefined): boolean => {
    if (!node) return false;
    const expression = peel(node);
    switch (expression.type) {
      case "Identifier":
        return names.has(expression.name);
      case "MemberExpression": {
        const object = peel(expression.object);
        // `req.body`, `request.query`
        if (
          object.type === "Identifier" &&
          REQUEST_OBJECTS.has(object.name) &&
          !expression.computed &&
          REQUEST_PROPERTIES.has(expression.property?.name ?? "")
        ) {
          return true;
        }
        // `event.context.params.id` (Nitro route params)
        if (isContextParams(expression)) return true;
        return isInput(object);
      }
      case "CallExpression": {
        const callee = peel(expression.callee);
        if (callee.type === "Identifier") {
          if (REQUEST_READERS.has(callee.name)) return true;
          return PASSTHROUGH_FUNCTIONS.has(callee.name) && isInput(expression.arguments?.[0]);
        }
        if (callee.type !== "MemberExpression" || callee.computed) return false;
        const method: string = callee.property?.name ?? "";
        const receiver = peel(callee.object);
        // `JSON.parse(body)`, `Object.entries(body)`, `Object.fromEntries(...)`
        if (receiver.type === "Identifier" && receiver.name === "JSON" && method === "parse") return isInput(expression.arguments?.[0]);
        if (receiver.type === "Identifier" && receiver.name === "Object" && ["entries", "keys", "values", "fromEntries"].includes(method)) {
          return isInput(expression.arguments?.[0]);
        }
        return PASSTHROUGH_METHODS.has(method) && isInput(receiver);
      }
      case "TemplateLiteral":
        return (expression.expressions as EsTreeNode[]).some(isInput);
      case "BinaryExpression":
        return expression.operator === "+" && (isInput(expression.left) || isInput(expression.right));
      case "ConditionalExpression":
        return isInput(expression.consequent) || isInput(expression.alternate);
      case "LogicalExpression":
        return isInput(expression.left) || isInput(expression.right);
      case "SpreadElement":
        return isInput(expression.argument);
      default:
        return false;
    }
  };

  const isContextParams = (member: EsTreeNode): boolean => {
    // Matches `event.context.params` and anything below it.
    let current: EsTreeNode = member;
    while (current.type === "MemberExpression") {
      const object = peel(current.object);
      if (
        !current.computed &&
        current.property?.name === "params" &&
        object.type === "MemberExpression" &&
        !object.computed &&
        object.property?.name === "context"
      ) {
        return true;
      }
      current = object;
    }
    return false;
  };

  return {
    isInput,
    recordDeclarator: (declarator) => {
      if (!declarator.init || !isInput(declarator.init)) return;
      for (const name of patternNames(declarator.id)) names.add(name);
    },
    recordAssignment: (assignment) => {
      if (assignment.operator !== "=" || assignment.left?.type !== "Identifier" || !isInput(assignment.right)) return;
      names.add(assignment.left.name);
    },
    addNames: (added) => {
      for (const name of added) names.add(name);
    },
  };
};

