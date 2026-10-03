import { defineRule } from "../../define-rule.js";
import { getStaticKeyName } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const GLOBAL_OBJECT_NAMES = new Set(["window", "globalThis", "self"]);
const TIMER_FUNCTIONS = new Set(["setTimeout", "setInterval"]);
/** Calls whose object argument is a component definition (`template` is the runtime-compiled option). */
const COMPONENT_DEFINERS = new Set(["defineComponent", "createApp", "component", "extend", "mixin"]);

const TRANSPARENT_WRAPPERS = new Set(["ParenthesizedExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"]);

const unwrap = (node: EsTreeNode): EsTreeNode => {
  let current = node;
  while (TRANSPARENT_WRAPPERS.has(current.type) && current.expression) current = current.expression;
  return current;
};

/** A fixed string: a literal, or a template without interpolation. Constant code is not injectable. */
const isStaticString = (node: EsTreeNode): boolean => {
  const expression = unwrap(node);
  if (expression.type === "Literal") return typeof expression.value === "string";
  if (expression.type === "TemplateLiteral") return expression.expressions.length === 0;
  return false;
};

/** Whether an expression is made of fixed strings only (`"a" + "b"` counts). */
const isConstantString = (node: EsTreeNode): boolean => {
  const expression = unwrap(node);
  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    return isConstantString(expression.left) && isConstantString(expression.right);
  }
  return isStaticString(expression);
};

/** Whether an expression evaluates to a string rather than a function (a string/template literal, or a concatenation involving one). */
const isStringValued = (node: EsTreeNode): boolean => {
  const expression = unwrap(node);
  if (expression.type === "Literal") return typeof expression.value === "string";
  if (expression.type === "TemplateLiteral") return true;
  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    return isStringValued(expression.left) || isStringValued(expression.right);
  }
  return false;
};

const isGlobalMember = (callee: EsTreeNode, name: string): boolean =>
  callee.type === "MemberExpression" &&
  !callee.computed &&
  callee.property?.name === name &&
  callee.object?.type === "Identifier" &&
  GLOBAL_OBJECT_NAMES.has(callee.object.name);

/** Function name of a call: `setTimeout`, `window.setTimeout`, `app.component`, `Vue.extend`. */
const calleeName = (callee: EsTreeNode): string | null => {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") return callee.property.name;
  return null;
};

export default defineRule({
  meta: {
    id: "no-dynamic-code",
    category: "Security",
    // Warning, not error: the sink is certain, but whether the string is attacker-controlled is not.
    // Direct `eval()` is reported by `no-eval` (error); this rule covers the other ways to run strings
    // as code, so no call is ever reported twice.
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-95"],
    owasp: "A03:2021",
    fixable: false,
    since: "2.0.0",
    help: "Do not turn strings into code: pass a function to `setTimeout`, replace `new Function` with a lookup table, and use SFC templates or render functions instead of runtime-compiled templates",
    agentGuidance:
      "Remove code built from strings (`eval` itself is reported by `no-eval`). Replace `new Function(...)` with a function map or a safe expression parser; " +
      "pass a function, not a string, to `setTimeout`/`setInterval` (`setTimeout(() => run(), 100)`); " +
      "replace runtime template compilation (`compile(template)` from `vue`, `Vue.compile`, a non-literal `template:` option) with single-file components or render functions. " +
      "A template that is a fixed string literal is not reported. Never compile a template that contains user input: that is client-side template injection (XSS).",
  },
  create: (context: RuleContext) => {
    // Local names `compile` is imported under from `vue` (`import { compile as c } from "vue"`).
    const compileNames = new Set<string>();

    const report = (node: EsTreeNode, message: string): void => {
      context.report({ node, message: `${message} — building code from strings is a code-injection risk (CWE-95)` });
    };

    const checkTemplateOption = (properties: EsTreeNode[]): void => {
      for (const property of properties) {
        if (property.type !== "Property" || getStaticKeyName(property) !== "template") continue;
        if (!isConstantString(property.value)) {
          report(property, "`template` option is compiled at runtime from a non-literal string (client-side template injection)");
        }
      }
    };

    return {
      ImportDeclaration(node: EsTreeNode) {
        const source = node.source?.value;
        if (typeof source !== "string" || !(source === "vue" || source.startsWith("vue/"))) return;
        for (const specifier of node.specifiers as EsTreeNode[]) {
          if (specifier.type === "ImportSpecifier" && specifier.imported?.name === "compile") compileNames.add(specifier.local.name);
        }
      },

      NewExpression(node: EsTreeNode) {
        const callee: EsTreeNode = node.callee;
        // `new Function(...)` / `new window.Function(...)`: arguments are the parameter names and the body.
        const isFunctionConstructor =
          (callee?.type === "Identifier" && callee.name === "Function") || (callee && isGlobalMember(callee, "Function"));
        if (isFunctionConstructor) {
          const args = node.arguments as EsTreeNode[];
          if (args.length > 0 && !args.every(isConstantString)) report(node, "`new Function()` builds a function from a non-literal string");
          return;
        }
        // `new Vue({ template: x })` (Vue 2)
        if (callee?.type === "Identifier" && callee.name === "Vue" && node.arguments?.[0]?.type === "ObjectExpression") {
          checkTemplateOption(node.arguments[0].properties);
        }
      },

      CallExpression(node: EsTreeNode) {
        const callee: EsTreeNode = node.callee;
        const name = callee ? calleeName(callee) : null;
        if (!name) return;
        const args = node.arguments as EsTreeNode[];

        // `Function("return " + code)` without `new`
        if (callee.type === "Identifier" && name === "Function") {
          if (args.length > 0 && !args.every(isConstantString)) report(node, "`Function()` builds a function from a non-literal string");
          return;
        }

        // `setTimeout("tick()", 100)`: the string is evaluated like `eval`.
        if (TIMER_FUNCTIONS.has(name) && (callee.type === "Identifier" || isGlobalMember(callee, name))) {
          if (args[0] && isStringValued(args[0])) report(node, `\`${name}()\` is given a string instead of a function`);
          return;
        }

        // `compile(template)` from "vue" / `Vue.compile(template)`
        const isRuntimeCompile =
          (callee.type === "Identifier" && compileNames.has(callee.name)) ||
          (callee.type === "MemberExpression" && !callee.computed && name === "compile" && callee.object?.type === "Identifier" && callee.object.name === "Vue");
        if (isRuntimeCompile) {
          if (args[0] && !isConstantString(args[0])) report(node, "`compile()` compiles a non-literal template at runtime (client-side template injection)");
          return;
        }

        // `defineComponent({ template: x })`, `createApp({ template: x })`, `app.component("x", { template: x })`
        if (COMPONENT_DEFINERS.has(name)) {
          for (const argument of args) {
            if (argument.type === "ObjectExpression") checkTemplateOption(argument.properties);
          }
        }
      },

      // `export default { template: x }` (Options API component)
      ExportDefaultDeclaration(node: EsTreeNode) {
        const declaration = node.declaration ? unwrap(node.declaration) : null;
        if (declaration?.type === "ObjectExpression") checkTemplateOption(declaration.properties);
      },
    };
  },
});
