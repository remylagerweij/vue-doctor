import { defineRule } from "../../define-rule.js";
import { getFilename, isSpecificCall, walkAst } from "../../helpers.js";
import { readSfcTemplate, templateUsesBindingAsValue } from "../../sfc.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const isDefinePropsCall = (node: EsTreeNode | null | undefined): boolean => Boolean(node && isSpecificCall(node, "defineProps"));

const isWithDefaultsCall = (node: EsTreeNode | null | undefined): boolean =>
  Boolean(node && isSpecificCall(node, "withDefaults") && isDefinePropsCall(node.arguments?.[0]));

// `props.title` and `props["title"]` survive destructuring; any other use needs the props object.
const isStaticMemberAccess = (identifier: EsTreeNode): boolean => {
  const parent = identifier.parent;
  if (parent?.type !== "MemberExpression" || parent.object !== identifier) return false;
  return !parent.computed || (parent.property?.type === "Literal" && typeof parent.property.value === "string");
};

const isNonReference = (identifier: EsTreeNode): boolean => {
  const parent = identifier.parent;
  if (parent?.type === "MemberExpression") return parent.property === identifier && !parent.computed;
  if (parent?.type === "Property" || parent?.type === "MethodDefinition" || parent?.type === "PropertyDefinition") {
    return parent.key === identifier && !parent.computed && !parent.shorthand;
  }
  return false;
};

const usesObjectAsValue = (program: EsTreeNode, declarator: EsTreeNode): boolean => {
  const name: string = declarator.id.name;
  let found = false;
  walkAst(program, (node) => {
    if (found || node.type !== "Identifier" || node.name !== name || node === declarator.id) return;
    if (isNonReference(node) || isStaticMemberAccess(node)) return;
    found = true;
  });
  return found;
};

export default defineRule({
  meta: {
    id: "prefer-defineProps-destructure",
    category: "Correctness",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["vue", "nuxt"],
    requires: ["props-destructure"],
    fixable: false,
    since: "1.0.0",
    help: "Destructure props with native defaults: `const { title, size = \"md\" } = defineProps<Props>()` (Vue 3.5+)",
    agentGuidance:
      "Only reported on Vue 3.5+ projects with reactive props destructure enabled, and only when the props object is used solely as `props.x`. Replace `const props = defineProps<Props>()` (or `withDefaults(defineProps<Props>(), { ... })`) with `const { a, b = 1 } = defineProps<Props>()` and rename `props.a` to `a`. Watch a destructured prop through a getter (`watch(() => a, ...)`) and pass it to composables as `toRef(() => a)` or `() => a`.",
  },
  create: (context: RuleContext) => {
    const candidates: EsTreeNode[] = [];
    let program: EsTreeNode | null = null;

    return {
      Program(node: EsTreeNode) {
        program = node;
      },
      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type !== "Identifier") return;
        if (isDefinePropsCall(node.init) || isWithDefaultsCall(node.init)) candidates.push(node);
      },
      "Program:exit"() {
        if (candidates.length === 0 || !program) return;
        const template = readSfcTemplate(getFilename(context));
        for (const declarator of candidates) {
          const name: string = declarator.id.name;
          if (usesObjectAsValue(program, declarator)) continue;
          if (template !== null && templateUsesBindingAsValue(template, name)) continue;
          const source = isWithDefaultsCall(declarator.init) ? "withDefaults(defineProps())" : "defineProps()";
          context.report({
            node: declarator,
            message: `const ${name} = ${source} is only read as \`${name}.x\` — destructure it: const { x, y = default } = defineProps<Props>()`,
          });
        }
      },
    };
  },
});
