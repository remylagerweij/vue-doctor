import { getCallbackStatements, getFilename, getWatchCallback, isSpecificCall, walkAst } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import { readSfcTemplate, templateWritesBinding } from "../../sfc.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const MUTATING_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "set", "add", "delete", "clear"]);

/** `target` of a lone `target.value = rhs` statement. */
const getRefAssignment = (statement: EsTreeNode): { target: string; right: EsTreeNode } | null => {
  const expression = statement.type === "ExpressionStatement" ? statement.expression : null;
  if (expression?.type !== "AssignmentExpression" || expression.operator !== "=") return null;
  const left = expression.left;
  if (
    left?.type !== "MemberExpression" ||
    left.computed ||
    left.property?.name !== "value" ||
    left.object?.type !== "Identifier"
  ) {
    return null;
  }
  return { target: left.object.name, right: expression.right };
};

const collectIdentifiers = (node: EsTreeNode | null | undefined, names: Set<string>): void => {
  if (!node) return;
  walkAst(node, (child) => {
    if (child.type !== "Identifier") return;
    const parent = child.parent;
    if (parent?.type === "MemberExpression" && parent.property === child && !parent.computed) return;
    names.add(child.name);
  });
};

const collectParameterNames = (callback: EsTreeNode, names: Set<string>): void => {
  for (const parameter of callback.params ?? []) collectIdentifiers(parameter, names);
};

const readsAny = (node: EsTreeNode, names: ReadonlySet<string>): boolean => {
  let found = false;
  walkAst(node, (child) => {
    if (found || child.type !== "Identifier" || !names.has(child.name)) return;
    const parent = child.parent;
    if (parent?.type === "MemberExpression" && parent.property === child && !parent.computed) return;
    found = true;
  });
  return found;
};

const READ_ONLY_CALLEES = new Set(["watch", "watchEffect", "computed", "unref", "toValue", "isRef", "toRaw", "String", "Number", "Boolean"]);

const isValueOf = (target: EsTreeNode | null | undefined, name: string): boolean =>
  target?.type === "MemberExpression" &&
  !target.computed &&
  target.property?.name === "value" &&
  target.object?.type === "Identifier" &&
  target.object.name === name;

const isRootedInValueOf = (target: EsTreeNode | null | undefined, name: string): boolean => {
  for (let current = target; current?.type === "MemberExpression"; current = current.object) {
    if (isValueOf(current, name)) return true;
  }
  return false;
};

// The bare ref leaves this code (argument, returned, stored in an object), so something else may write it.
const escapes = (identifier: EsTreeNode): boolean => {
  const parent = identifier.parent;
  switch (parent?.type) {
    case "CallExpression":
      return parent.callee !== identifier && !(parent.callee?.type === "Identifier" && READ_ONLY_CALLEES.has(parent.callee.name));
    case "Property":
      return parent.value === identifier;
    case "ArrayExpression":
    case "ReturnStatement":
    case "SpreadElement":
      return true;
    case "VariableDeclarator":
      return parent.init === identifier;
    case "AssignmentExpression":
      return parent.right === identifier;
    default:
      return false;
  }
};

const isWriteOf = (node: EsTreeNode, name: string): boolean => {
  if (node.type === "AssignmentExpression") return isRootedInValueOf(node.left, name);
  if (node.type === "UpdateExpression") return isRootedInValueOf(node.argument, name);
  if (node.type === "Identifier") return node.name === name && escapes(node);
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  return callee?.type === "MemberExpression" && MUTATING_METHODS.has(callee.property?.name) && isRootedInValueOf(callee.object, name);
};

export default defineRule({
  meta: {
    id: "no-watch-for-computed",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Replace the watcher with a computed property: `const value = computed(() => transform(source))`",
    agentGuidance:
      "The watcher only derives a ref from its source, and nothing else writes that ref. Delete the watcher and the ref, and declare `const value = computed(() => ...)` using the same source. Refs that the user or other code also writes (a page reset, an editable copy of a prop) are not reported.",
  },
  create: (context: RuleContext) => {
    const candidates: { watch: EsTreeNode; assignment: EsTreeNode; target: string }[] = [];
    let program: EsTreeNode | null = null;

    return {
      Program(node: EsTreeNode) {
        program = node;
      },
      CallExpression(node: EsTreeNode) {
        if (!isSpecificCall(node, "watch") || node.arguments?.length < 2) return;
        const callback = getWatchCallback(node);
        if (!callback) return;
        const statements = getCallbackStatements(callback);
        if (statements.length !== 1) return;
        const assignment = getRefAssignment(statements[0]);
        if (!assignment) return;

        const sources = new Set<string>();
        collectIdentifiers(node.arguments[0], sources);
        collectParameterNames(callback, sources);
        if (!readsAny(assignment.right, sources)) return;
        candidates.push({ watch: node, assignment: statements[0].expression, target: assignment.target });
      },
      "Program:exit"() {
        if (candidates.length === 0 || !program) return;
        const template = readSfcTemplate(getFilename(context));
        for (const { watch, assignment, target } of candidates) {
          if (template !== null && templateWritesBinding(template, target)) continue;
          let writtenElsewhere = false;
          walkAst(program, (child) => {
            if (writtenElsewhere || child === assignment) return;
            if (isWriteOf(child, target)) writtenElsewhere = true;
          });
          if (writtenElsewhere) continue;
          context.report({
            node: watch,
            message: `watch() only derives \`${target}\` from its source and nothing else writes it — replace both with a computed property`,
          });
        }
      },
    };
  },
});
