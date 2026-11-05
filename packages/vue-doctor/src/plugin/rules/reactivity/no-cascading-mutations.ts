import { WATCH_FUNCTIONS } from "../../constants.js";
import { getWatchCallback, getWatchEffectCallback, isFunctionNode, isSpecificCall, walkAst, WALK_SKIP } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const MUTATING_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "set", "add", "delete", "clear"]);

interface Watcher {
  node: EsTreeNode;
  /** State paths the watcher re-runs on (`count`, `form.email`); `.value` is dropped. */
  sources: string[];
  /** State paths written anywhere in the callback. */
  writes: string[];
  /** Paths the callback derives synchronously from what it watches: `y.value = f(x.value)`. */
  derived: string[];
}

/** `a.value.b` → "a.b"; null when the chain is computed or not rooted in an identifier. */
const statePath = (node: EsTreeNode | null | undefined): string | null => {
  const parts: string[] = [];
  let current = node;
  while (current?.type === "MemberExpression") {
    if (current.computed) {
      parts.length = 0;
    } else if (current.property?.name !== "value") {
      parts.unshift(current.property.name);
    }
    current = current.object;
  }
  return current?.type === "Identifier" ? [current.name, ...parts].join(".") : null;
};

const overlaps = (left: string, right: string): boolean =>
  left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);

const writeTarget = (node: EsTreeNode): EsTreeNode | null => {
  if (node.type === "AssignmentExpression") return node.left?.type === "MemberExpression" ? node.left : null;
  if (node.type === "UpdateExpression") return node.argument?.type === "MemberExpression" ? node.argument : null;
  const callee = node.type === "CallExpression" ? node.callee : null;
  return callee?.type === "MemberExpression" && MUTATING_METHODS.has(callee.property?.name) ? callee.object : null;
};

// Outermost member chains of an expression (`props.user.name`, `count.value`), as state paths.
const readPaths = (node: EsTreeNode | null | undefined): string[] => {
  const paths: string[] = [];
  if (!node) return paths;
  walkAst(node, (child) => {
    if (child.type !== "MemberExpression" && child.type !== "Identifier") return;
    const parent = child.parent;
    if (parent?.type === "MemberExpression" && parent.property === child && !parent.computed) return WALK_SKIP;
    if (parent?.type === "Property" && parent.key === child && !parent.computed) return WALK_SKIP;
    const path = statePath(child);
    if (!path) return;
    paths.push(path);
    return WALK_SKIP;
  });
  return paths;
};

const hasAwait = (node: EsTreeNode): boolean => {
  let found = false;
  walkAst(node, (child) => {
    if (child.type === "AwaitExpression") found = true;
  });
  return found;
};

const analyzeWatcher = (node: EsTreeNode): Watcher | null => {
  const isWatch = node.callee.name === "watch";
  const callback = isWatch ? getWatchCallback(node) : getWatchEffectCallback(node);
  if (!callback) return null;

  const params = new Set<string>();
  for (const param of callback.params ?? []) if (param.type === "Identifier") params.add(param.name);

  const writes: string[] = [];
  const assignments: EsTreeNode[] = [];
  walkAst(callback.body, (child) => {
    const target = writeTarget(child);
    const path = target ? statePath(target) : null;
    if (path) writes.push(path);
    if (child.type === "AssignmentExpression" && path) assignments.push(child);
  });

  const sources = isWatch ? readPaths(node.arguments[0]) : readPaths(callback.body).filter((path) => !writes.includes(path));
  const derived: string[] = [];
  walkAst(callback.body, (child) => {
    if (isFunctionNode(child)) return WALK_SKIP;
    if (!assignments.includes(child) || hasAwait(child.right)) return;
    const reads = readPaths(child.right);
    const fromSource = reads.some((read) => params.has(read.split(".")[0]) || sources.some((source) => overlaps(read, source)));
    const path = statePath(child.left);
    // `y = f(y, x)` keeps an invariant on its own previous value; computed() cannot replace it.
    if (fromSource && path && !reads.some((read) => overlaps(read, path))) derived.push(path);
  });
  return { node, sources, writes, derived };
};

export default defineRule({
  meta: {
    id: "no-cascading-mutations",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Derive the second value with `computed()` instead of chaining watchers, or update both values in one place",
    agentGuidance:
      "One watcher writes state that a second watcher watches, and the second one derives more state from it, so every change cascades through two flush cycles. Replace the derived ref of the second watcher with `computed(() => ...)` over the same source, or move both updates into the function that starts the change. Several assignments in one watcher (a form reset) are not reported.",
  },
  create: (context: RuleContext) => {
    const watchers: Watcher[] = [];
    return {
      CallExpression(node: EsTreeNode) {
        if (!isSpecificCall(node, WATCH_FUNCTIONS)) return;
        const watcher = analyzeWatcher(node);
        if (watcher) watchers.push(watcher);
      },
      "Program:exit"() {
        for (const triggered of watchers) {
          if (triggered.derived.length === 0) continue;
          for (const writer of watchers) {
            if (writer === triggered) continue;
            const link = writer.writes.find((write) => triggered.sources.some((source) => overlaps(write, source)));
            if (!link) continue;
            context.report({
              node: triggered.node,
              message: `${triggered.node.callee.name}() re-runs when another watcher writes \`${link}\`, then derives \`${triggered.derived[0]}\` from it — cascading watchers; use computed() or update both in one place`,
            });
            break;
          }
        }
      },
    };
  },
});
