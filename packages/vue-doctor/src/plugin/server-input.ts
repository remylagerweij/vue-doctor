import { isUserControlledUrl, memberPath, peel, taintedNamesBoundBy, type UntrustedSource } from "./url-sinks.js";
import type { EsTreeNode, RuleVisitors } from "./types.js";

/**
 * Untrusted-input helpers for Nuxt/h3 server handlers (`server/**`), shared by `require-input-validation`,
 * `no-ssrf` and `no-open-redirect`. The taint model is the one `url-sinks.ts` uses for route values,
 * extended with request readers (`getQuery(event)`, `readBody(event)`...) and run per function.
 */

/** Matches files of Nuxt's `server/` directory (any depth below it, any platform separator already normalised). */
const SERVER_FILE_PATTERN = /(?:^|\/)server\//;
/** The handler folders; `server/utils` and `server/plugins` are helpers and Nitro plugins, not request handlers. */
const SERVER_HANDLER_PATTERN = /(?:^|\/)server\/(?:api|routes|middleware|handlers)\//;

export const isServerFile = (filename: string): boolean => SERVER_FILE_PATTERN.test(filename);
export const isServerHandlerFile = (filename: string): boolean => SERVER_HANDLER_PATTERN.test(filename);

/** h3 readers whose result is the request's data, unvalidated. The `get`/`read` + `Validated` variants are deliberately absent. */
export const RAW_INPUT_READERS: ReadonlySet<string> = new Set([
  "getQuery",
  "getRouterParam",
  "getRouterParams",
  "readBody",
  "readRawBody",
  "readFormData",
  "readMultipartFormData",
  "getHeader",
  "getHeaders",
  "getRequestHeader",
  "getRequestHeaders",
]);

/** Readers whose result is untrusted for taint purposes: the raw readers plus cookies (which a validation rule leaves alone). */
const TAINT_READERS: ReadonlySet<string> = new Set([...RAW_INPUT_READERS, "getCookie", "parseCookies"]);

/** Request properties on the event: `event.context.params.id`, `event.node.req.url`, `event.node.req.headers.host`, `event.path`. */
const EVENT_INPUT_PREFIXES: readonly (readonly string[])[] = [
  ["event", "context", "params"],
  ["event", "node", "req", "url"],
  ["event", "node", "req", "headers"],
  ["event", "path"],
];

const calleeIdentifier = (node: EsTreeNode): string | null => {
  const callee = peel(node.callee);
  return callee.type === "Identifier" ? callee.name : null;
};

/** `getQuery(event)` / `readBody<T>(event)`: a call of a raw reader. */
export const isRawReaderCall = (node: EsTreeNode): boolean => {
  if (node.type !== "CallExpression") return false;
  const name = calleeIdentifier(node);
  return name !== null && RAW_INPUT_READERS.has(name);
};

const unwrapAwait = (node: EsTreeNode): EsTreeNode => {
  const expression = peel(node);
  return expression.type === "AwaitExpression" ? unwrapAwait(expression.argument) : expression;
};

/** Whether an expression is a request read, or a member path below one / below a name bound to one. */
export const isServerInput: UntrustedSource = (node, taintedNames) => {
  const expression = peel(node);
  if (expression.type === "CallExpression") {
    const name = calleeIdentifier(expression);
    return name !== null && TAINT_READERS.has(name);
  }
  if (expression.type === "NewExpression") {
    // `new URL(untrusted)` keeps the untrusted host.
    return (
      expression.callee?.type === "Identifier" &&
      expression.callee.name === "URL" &&
      isUserControlledUrl(expression.arguments?.[0], taintedNames, isServerInput)
    );
  }
  if (expression.type !== "MemberExpression") return false;
  const path = memberPath(expression);
  if (path && EVENT_INPUT_PREFIXES.some((prefix) => prefix.every((part, index) => path[index] === part))) return true;
  // Walk down to the root of `body.target.host` / `getQuery(event).url` / `(await readBody(event)).url`.
  let root = peel(expression.object);
  while (root.type === "MemberExpression") root = peel(root.object);
  root = unwrapAwait(root);
  if (root.type === "Identifier") return taintedNames.has(root.name);
  return root.type === "CallExpression" && isServerInput(root, taintedNames);
};

const FUNCTION_TYPES = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"] as const;

/** Operators that compare a value with something, and so count as a check of it. */
const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(["===", "!==", "==", "!="]);
/** Methods that test a value against an allowlist, a prefix or a pattern. */
const CHECK_METHODS: ReadonlySet<string> = new Set(["includes", "has", "indexOf", "startsWith", "endsWith", "test", "match", "some", "every"]);
/** Names of validation helpers: `assertSafeUrl`, `isAllowedHost`, `validateRedirect`, `schema.parse`, `Value.Check`... */
const CHECK_FUNCTION_PATTERN = /sanitiz|safe|valid|allow|trust|check|verify|assert|ensure|guard|permit|schema|^parse$|^safeParse/i;

const nodeName = (node: EsTreeNode | null | undefined): string | null => {
  if (!node) return null;
  const callee = peel(node);
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") return callee.property.name;
  return null;
};

/** `undefined` / `null` / `typeof x`: comparing with these tests presence, not the value. */
const isPresenceOperand = (node: EsTreeNode): boolean => {
  const expression = peel(node);
  return (
    (expression.type === "Identifier" && expression.name === "undefined") ||
    (expression.type === "Literal" && expression.value === null) ||
    (expression.type === "UnaryExpression" && expression.operator === "typeof")
  );
};

/** The first operand a value starts with: `` `${next}/x` `` and `next + "/x"` start with `next`. */
const leadingOperand = (node: EsTreeNode): EsTreeNode => {
  const expression = unwrapAwait(node);
  if (expression.type === "TemplateLiteral" && (expression.quasis?.[0]?.value?.cooked ?? "") === "" && expression.expressions?.[0]) {
    return leadingOperand(expression.expressions[0]);
  }
  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    if (expression.left?.type === "Literal" && expression.left.value === "") return leadingOperand(expression.right);
    return leadingOperand(expression.left);
  }
  if (expression.type === "CallExpression" && expression.callee?.type === "MemberExpression") {
    // `next.trim()`: the receiver is what a check of the value has to mention.
    return leadingOperand(expression.callee.object);
  }
  return expression;
};

export interface InputTracker {
  /** Visitors to merge into a rule: function scoping, `const x = getQuery(event)` bindings, checks. */
  visitors: RuleVisitors;
  /** Whether an expression carries untrusted input that no check in scope has validated yet. */
  isUnsafe: (node: EsTreeNode | null | undefined) => boolean;
}

interface Scope {
  tainted: Set<string>;
  checked: Set<string>;
}

/**
 * Tracks, per function, which names hold request input and which expressions the code has
 * checked (compared, tested against an allowlist/prefix, passed to a validator). A check anywhere
 * earlier in the function counts: the analysis is deliberately lenient so that a finding means
 * "nothing like a check was seen", which keeps false positives rare.
 * `parsedUrlIsCheck` treats `new URL(x)` as a check of `x` (right for redirects, where parsing and
 * comparing the origin is the recommended pattern, but not for SSRF, where the parsed host still
 * has to be compared).
 */
export const createInputTracker = ({ parsedUrlIsCheck }: { parsedUrlIsCheck: boolean }): InputTracker => {
  const scopes: Scope[] = [{ tainted: new Set(), checked: new Set() }];
  const current = (): Scope => scopes[scopes.length - 1];

  const enter = (): void => {
    const parent = current();
    scopes.push({ tainted: new Set(parent.tainted), checked: new Set(parent.checked) });
  };
  const exit = (): void => {
    if (scopes.length > 1) scopes.pop();
  };

  /** Records the expression and the name it starts with as checked (`target.hostname` checks `target`). */
  const markChecked = (node: EsTreeNode | null | undefined): void => {
    if (!node) return;
    const path = memberPath(leadingOperand(node));
    if (!path) return;
    current().checked.add(path.join("."));
    current().checked.add(path[0]);
  };

  const isChecked = (node: EsTreeNode): boolean => {
    const path = memberPath(leadingOperand(node));
    return path !== null && (current().checked.has(path.join(".")) || current().checked.has(path[0]));
  };

  const noteChecks = (node: EsTreeNode): void => {
    if (node.type === "BinaryExpression" && COMPARISON_OPERATORS.has(node.operator)) {
      if (isPresenceOperand(node.left) || isPresenceOperand(node.right)) return;
      markChecked(node.left);
      markChecked(node.right);
      return;
    }
    if (node.type === "NewExpression") {
      if (parsedUrlIsCheck && node.callee?.type === "Identifier" && node.callee.name === "URL") markChecked(node.arguments?.[0]);
      return;
    }
    if (node.type !== "CallExpression") return;
    const name = nodeName(node.callee);
    if (!name) return;
    const callee = peel(node.callee);
    if (callee.type === "MemberExpression" && CHECK_METHODS.has(name)) {
      markChecked(callee.object);
      markChecked(node.arguments?.[0]);
    } else if (CHECK_FUNCTION_PATTERN.test(name) && !(callee.type === "MemberExpression" && nodeName(callee.object) === "JSON")) {
      for (const argument of node.arguments as EsTreeNode[]) markChecked(argument);
    }
  };

  const bind = (names: readonly string[]): void => {
    for (const name of names) {
      current().tainted.add(name);
      // A re-bound name is a new value: what was checked for the old one says nothing about it.
      current().checked.delete(name);
    }
  };

  const isUnsafe = (node: EsTreeNode | null | undefined): boolean => {
    if (!node) return false;
    const expression = unwrapAwait(node);
    if (expression.type === "ConditionalExpression") return isUnsafe(expression.consequent) || isUnsafe(expression.alternate);
    if (expression.type === "LogicalExpression") {
      return (expression.operator !== "&&" && isUnsafe(expression.left)) || isUnsafe(expression.right);
    }
    return isUserControlledUrl(expression, current().tainted, isServerInput) && !isChecked(expression);
  };

  const visitors: RuleVisitors = {
    VariableDeclarator(node: EsTreeNode) {
      bind(taintedNamesBoundBy(node, current().tainted, isServerInput));
    },
    AssignmentExpression(node: EsTreeNode) {
      if (node.operator === "=" && node.left?.type === "Identifier" && isUserControlledUrl(node.right, current().tainted, isServerInput)) {
        bind([node.left.name]);
      }
    },
    BinaryExpression: noteChecks,
    NewExpression: noteChecks,
    CallExpression: noteChecks,
  };
  for (const type of FUNCTION_TYPES) {
    visitors[type] = enter;
    visitors[`${type}:exit`] = exit;
  }
  return { visitors, isUnsafe };
};

/** Merges a rule's own visitors with the tracker's; the tracker's run first so a check on a node is seen before the sink check. */
export const withInputTracker = (tracker: InputTracker, ruleVisitors: RuleVisitors): RuleVisitors => {
  const merged: RuleVisitors = { ...tracker.visitors };
  for (const [selector, visit] of Object.entries(ruleVisitors)) {
    const tracked = tracker.visitors[selector] as ((node: EsTreeNode) => void) | undefined;
    const own = visit as (node: EsTreeNode) => void;
    merged[selector] = tracked
      ? (node: EsTreeNode) => {
          tracked(node);
          own(node);
        }
      : own;
  }
  return merged;
};
