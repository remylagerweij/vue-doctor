import { getFilename, isSpecificCall, walkAst } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import { readSfcTemplate, templateWritesBinding } from "../../sfc.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

// `initialView`, `defaultIndex`: by name a seed the component is expected to copy once.
const SEED_PROP_NAME = /^(?:initial|default)(?:[A-Z_]|$)/;

const MUTATING_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "set", "add", "delete", "clear"]);

const TRANSPARENT_WRAPPERS = new Set(["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "ParenthesizedExpression"]);

const peel = (node: EsTreeNode): EsTreeNode => {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type) && current.expression) current = current.expression;
  return current;
};

const isPropsMacro = (node: EsTreeNode | null | undefined): boolean => {
  if (!node) return false;
  if (isSpecificCall(node, "defineProps")) return true;
  const inner: EsTreeNode | undefined = node.arguments?.[0];
  return isSpecificCall(node, "withDefaults") && Boolean(inner) && isSpecificCall(inner!, "defineProps");
};

const isRootedInValueOf = (target: EsTreeNode | null | undefined, name: string): boolean => {
  for (let current = target; current?.type === "MemberExpression"; current = current.object) {
    if (!current.computed && current.property?.name === "value" && current.object?.type === "Identifier" && current.object.name === name) {
      return true;
    }
  }
  return false;
};

const isWriteOf = (node: EsTreeNode, name: string): boolean => {
  if (node.type === "AssignmentExpression") return isRootedInValueOf(node.left, name);
  if (node.type === "UpdateExpression") return isRootedInValueOf(node.argument, name);
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    MUTATING_METHODS.has(node.callee.property?.name) &&
    isRootedInValueOf(node.callee.object, name)
  );
};

interface Candidate {
  node: EsTreeNode;
  propName: string;
  /** Name of the ref the copy is stored in, when it is bound to a variable. */
  binding: string | null;
}

export default defineRule({
  meta: {
    id: "no-ref-from-prop",
    category: "Reactivity",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Remove the ref and derive inline: `const value = computed(() => transform(props.propName))`",
    agentGuidance:
      "Do not copy a prop into a `ref()` that is never updated again; the copy goes stale when the prop changes. Use `computed(() => props.x)` for derived values, or emit an event to the parent when the value must be edited. Copies that are written later (an editable draft, a ref re-synced by `watch(() => props.x, ...)`) and `initial*`/`default*` seed props are not reported.",
  },
  create: (context: RuleContext) => {
    const propsObjects = new Set<string>(["props"]);
    const destructuredProps = new Map<string, string>();
    const candidates: Candidate[] = [];
    let program: EsTreeNode | null = null;

    const propNameOf = (argument: EsTreeNode): string | null => {
      const value = peel(argument);
      if (value.type === "Identifier") return destructuredProps.get(value.name) ?? null;
      if (value.type !== "MemberExpression" || value.object?.type !== "Identifier" || !propsObjects.has(value.object.name)) return null;
      if (!value.computed) return value.property?.name ?? null;
      return value.property?.type === "Literal" ? String(value.property.value) : null;
    };

    return {
      Program(node: EsTreeNode) {
        program = node;
      },
      VariableDeclarator(node: EsTreeNode) {
        if (!isPropsMacro(node.init)) return;
        if (node.id?.type === "Identifier") propsObjects.add(node.id.name);
        if (node.id?.type !== "ObjectPattern") return;
        for (const property of node.id.properties ?? []) {
          if (property.type !== "Property" || property.computed) continue;
          const key = property.key?.type === "Identifier" ? property.key.name : property.key?.value;
          const local = property.value?.type === "AssignmentPattern" ? property.value.left : property.value;
          if (typeof key === "string" && local?.type === "Identifier") destructuredProps.set(local.name, key);
        }
      },
      CallExpression(node: EsTreeNode) {
        if (!isSpecificCall(node, "ref") || !node.arguments?.length) return;
        const propName = propNameOf(node.arguments[0]);
        if (propName === null || SEED_PROP_NAME.test(propName)) return;
        const declarator = node.parent?.type === "VariableDeclarator" ? node.parent : null;
        const binding = declarator?.init === node && declarator.id?.type === "Identifier" ? declarator.id.name : null;
        candidates.push({ node, propName, binding });
      },
      "Program:exit"() {
        if (candidates.length === 0 || !program) return;
        const template = readSfcTemplate(getFilename(context));
        for (const { node, propName, binding } of candidates) {
          if (binding !== null) {
            if (template !== null && templateWritesBinding(template, binding)) continue;
            let written = false;
            walkAst(program, (child) => {
              if (!written && isWriteOf(child, binding)) written = true;
            });
            if (written) continue;
          }
          context.report({
            node,
            message: `ref() initialized from the prop \`${propName}\` and never updated — this copy won't stay in sync. Use computed() or toRef(() => props.${propName}) instead`,
          });
        }
      },
    };
  },
});
