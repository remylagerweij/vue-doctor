import {
  FETCH_CALLEE_NAMES,
  FETCH_MEMBER_OBJECTS,
  LOOP_TYPES,
  UPPERCASE_PATTERN,
} from "./constants.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "./types.js";
import { VISITOR_KEYS } from "./visitor-keys.js";

// Path of the file being linted, with forward slashes on every platform. Throws instead of
// returning "" so a host without a filename API fails loudly rather than silently disabling
// every path-based rule (server/, .vue, test files).
export const getFilename = (context: RuleContext): string => {
  const filename =
    context.filename ?? (typeof context.getFilename === "function" ? context.getFilename() : undefined);
  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error(
      "vue-doctor: the lint host did not provide a filename (expected context.filename). " +
        "Path-based rules cannot run without it; use an ESLint 9+ compatible host such as oxlint.",
    );
  }
  return filename.replace(/\\/g, "/");
};

/** The rule's options object (`["warn", { ... }]`), or `{}` when none is configured. */
export const getRuleOptions = (context: RuleContext): Readonly<Record<string, unknown>> => {
  const first = context.options?.[0];
  return first !== null && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>) : {};
};

/** A string-list option, ignoring anything that is not a string. */
export const getStringListOption = (options: Readonly<Record<string, unknown>>, key: string): string[] => {
  const value = options[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
};

// Walk protocol: a visitor may return WALK_SKIP to not descend into the current node's
// children, or WALK_STOP to abort the whole walk. Any other return value is ignored.
export const WALK_SKIP = Symbol("walk-skip");
export const WALK_STOP = Symbol("walk-stop");

type WalkResult = typeof WALK_SKIP | typeof WALK_STOP | void;

const isNode = (value: unknown): value is EsTreeNode =>
  typeof value === "object" && value !== null && Boolean((value as EsTreeNode).type);

// Returns true once the visitor asked to stop, so every level of the recursion unwinds.
const walkNode = (node: EsTreeNode, visitor: (child: EsTreeNode) => WalkResult): boolean => {
  const result = visitor(node);
  if (result === WALK_STOP) return true;
  if (result === WALK_SKIP) return false;

  // Unknown node types fall back to scanning every own key.
  const keys = VISITOR_KEYS[node.type] ?? Object.keys(node);
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
    const key = keys[keyIndex];
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (let itemIndex = 0; itemIndex < child.length; itemIndex++) {
        const item = child[itemIndex];
        if (isNode(item) && walkNode(item, visitor)) return true;
      }
    } else if (isNode(child) && walkNode(child, visitor)) {
      return true;
    }
  }
  return false;
};

export const walkAst = (node: EsTreeNode, visitor: (child: EsTreeNode) => WalkResult): void => {
  if (!node || typeof node !== "object") return;
  walkNode(node, visitor);
};

export const isSpecificCall = (node: EsTreeNode, name: string | Set<string>): boolean =>
  node.type === "CallExpression" &&
  node.callee?.type === "Identifier" &&
  (typeof name === "string" ? node.callee.name === name : name.has(node.callee.name));

export const isUppercaseName = (name: string): boolean => UPPERCASE_PATTERN.test(name);

/** True when an ImportDeclaration is type-only (`import type ...` or all specifiers are `type`). */
export const isTypeOnlyImport = (node: EsTreeNode): boolean => {
  if (node.importKind === "type") return true;
  const specifiers = node.specifiers as EsTreeNode[] | undefined;
  return Boolean(
    specifiers &&
      specifiers.length > 0 &&
      specifiers.every((specifier) => specifier.importKind === "type"),
  );
};

export const getWatchCallback = (node: EsTreeNode): EsTreeNode | null => {
  if (!node.arguments?.length || node.arguments.length < 2) return null;
  const callback = node.arguments[1];
  if (callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression") {
    return callback;
  }
  return null;
};

export const getWatchEffectCallback = (node: EsTreeNode): EsTreeNode | null => {
  if (!node.arguments?.length) return null;
  const callback = node.arguments[0];
  if (callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression") {
    return callback;
  }
  return null;
};

export const getCallbackStatements = (callback: EsTreeNode): EsTreeNode[] => {
  if (callback.body?.type === "BlockStatement") {
    return callback.body.body ?? [];
  }
  return callback.body ? [callback.body] : [];
};

export interface WatchCallbackAnalysis {
  hasFetchCall: boolean;
}

// What the watcher rules need to know about a callback, gathered in one walk and memoized per callback node.
const watchCallbackAnalyses = new WeakMap<EsTreeNode, WatchCallbackAnalysis>();

export const analyzeWatchCallback = (callback: EsTreeNode): WatchCallbackAnalysis => {
  const cached = watchCallbackAnalyses.get(callback);
  if (cached) return cached;

  const analysis: WatchCallbackAnalysis = { hasFetchCall: false };
  walkAst(callback, (child) => {
    if (child.type === "CallExpression" && !analysis.hasFetchCall) {
      const callee = child.callee;
      if (
        (callee?.type === "Identifier" && FETCH_CALLEE_NAMES.has(callee.name)) ||
        (callee?.type === "MemberExpression" &&
          callee.object?.type === "Identifier" &&
          FETCH_MEMBER_OBJECTS.has(callee.object.name))
      ) {
        analysis.hasFetchCall = true;
      }
    }
  });
  watchCallbackAnalyses.set(callback, analysis);
  return analysis;
};

export const createLoopAwareVisitors = (
  innerVisitors: Record<string, (node: EsTreeNode) => void>,
): RuleVisitors => {
  let loopDepth = 0;
  const incrementLoopDepth = (): void => {
    loopDepth++;
  };
  const decrementLoopDepth = (): void => {
    loopDepth--;
  };

  const visitors: RuleVisitors = {};

  for (const loopType of LOOP_TYPES) {
    visitors[loopType] = incrementLoopDepth;
    visitors[`${loopType}:exit`] = decrementLoopDepth;
  }

  for (const [nodeType, handler] of Object.entries(innerVisitors)) {
    visitors[nodeType] = (node: EsTreeNode) => {
      if (loopDepth > 0) handler(node);
    };
  }

  return visitors;
};

const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

export const isFunctionNode = (node: EsTreeNode | null | undefined): boolean =>
  Boolean(node && FUNCTION_TYPES.has(node.type));

// Name of a Property / MethodDefinition key (`setup`, `"setup"`), or null when computed/dynamic.
export const getStaticKeyName = (member: EsTreeNode): string | null => {
  if (member.computed) return null;
  if (member.key?.type === "Identifier") return member.key.name;
  if (member.key?.type === "Literal" && typeof member.key.value === "string") return member.key.value;
  return null;
};

// True for the function that implements the Options API `setup()` hook:
// `setup() {}`, `setup: function () {}` and `setup: () => {}` inside an object literal.
export const isSetupFunction = (node: EsTreeNode | null | undefined): boolean => {
  if (!node || !isFunctionNode(node) || node.type === "FunctionDeclaration") return false;
  const owner = node.parent;
  return (
    (owner?.type === "Property" || owner?.type === "MethodDefinition") &&
    owner.value === node &&
    getStaticKeyName(owner) === "setup"
  );
};

// Nearest enclosing function of `node` (optionally skipping arrow functions, which do not
// rebind `this`). Relies on `node.parent`, which ESLint and oxlint both provide.
export const findEnclosingFunction = (
  node: EsTreeNode,
  options: { skipArrows?: boolean } = {},
): EsTreeNode | null => {
  for (let current = node.parent; current; current = current.parent) {
    if (!isFunctionNode(current)) continue;
    if (options.skipArrows && current.type === "ArrowFunctionExpression") continue;
    return current;
  }
  return null;
};
