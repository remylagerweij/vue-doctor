import { getFilename, isFunctionNode, walkAst } from "../../helpers.js";
import { isClientRenderedPage } from "../../nuxt-files.js";
import { indexTemplate, type TemplateIndex } from "../../vue-template.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const SSR_UNSAFE_GLOBALS = new Set(["window", "document", "navigator", "localStorage", "sessionStorage"]);

// Hooks and browser-event helpers whose callbacks never run during SSR.
const CLIENT_ONLY_CALLBACK_HOOKS = new Set([
  "onBeforeMount",
  "onMounted",
  "onBeforeUnmount",
  "onUnmounted",
  "onUpdated",
  "onBeforeUpdate",
  "onActivated",
  "onDeactivated",
  "onNuxtReady",
  "useEventListener",
  "onClickOutside",
  "onKeyStroke",
  "useResizeObserver",
  "useIntersectionObserver",
  "useMutationObserver",
]);

const EVENT_LISTENER_METHODS = new Set(["addEventListener", "removeEventListener"]);

// Wrappers that only defer the function they are given: `const onResize = useDebounceFn(() => ...)`.
const DEFERRING_WRAPPERS = new Set(["useDebounceFn", "useThrottleFn", "debounce", "throttle"]);

const CLIENT_FILE_PATTERN = /\.client\.(?:vue|[cm]?[jt]sx?)$/;

const isFlag = (node: EsTreeNode | undefined, owner: "import.meta" | "process", name: string): boolean => {
  if (node?.type !== "MemberExpression" || node.computed) return false;
  if (node.property?.type !== "Identifier" || node.property.name !== name) return false;
  const objectNode = node.object;
  return owner === "process"
    ? objectNode?.type === "Identifier" && objectNode.name === "process"
    : objectNode?.type === "MetaProperty" && objectNode.meta?.name === "import" && objectNode.property?.name === "meta";
};

const isClientFlag = (node: EsTreeNode | undefined): boolean =>
  isFlag(node, "import.meta", "client") || isFlag(node, "import.meta", "browser") || isFlag(node, "process", "client");

const isServerFlag = (node: EsTreeNode | undefined): boolean =>
  isFlag(node, "import.meta", "server") || isFlag(node, "process", "server");

// `typeof window` / `typeof document` ... style checks.
const isTypeofGlobal = (node: EsTreeNode | undefined): boolean =>
  node?.type === "UnaryExpression" &&
  node.operator === "typeof" &&
  node.argument?.type === "Identifier" &&
  SSR_UNSAFE_GLOBALS.has(node.argument.name);

const isUndefinedLiteral = (node: EsTreeNode | undefined): boolean =>
  (node?.type === "Literal" && node.value === "undefined") ||
  (node?.type === "Identifier" && node.name === "undefined");

type GuardResolver = (test: EsTreeNode) => EsTreeNode | undefined;

// Does `test` being truthy imply the code runs in the browser? (`negated` flips the question:
// does `test` being falsy imply the browser.)
// `resolve` looks through a same-file guard: `const isClient = ...` or `function isBrowser() { return ... }`.
const impliesBrowser = (test: EsTreeNode | undefined, negated: boolean, resolve?: GuardResolver): boolean => {
  if (!test) return false;
  if (test.type === "UnaryExpression" && test.operator === "!") return impliesBrowser(test.argument, !negated, resolve);
  if (test.type === "LogicalExpression") {
    // `a && b` truthy => both truthy; `a || b` falsy => both falsy.
    const combinesAll = (test.operator === "&&") !== negated;
    if (combinesAll) {
      return impliesBrowser(test.left, negated, resolve) || impliesBrowser(test.right, negated, resolve);
    }
    return impliesBrowser(test.left, negated, resolve) && impliesBrowser(test.right, negated, resolve);
  }
  if (resolve && (test.type === "Identifier" || (test.type === "CallExpression" && test.arguments?.length === 0))) {
    return impliesBrowser(resolve(test), negated);
  }
  if (isClientFlag(test)) return !negated;
  if (isServerFlag(test)) return negated;
  if (test.type === "BinaryExpression") {
    const isEquality = test.operator === "===" || test.operator === "==";
    const isInequality = test.operator === "!==" || test.operator === "!=";
    if (!isEquality && !isInequality) return false;
    const typeofSide = isTypeofGlobal(test.left) ? test.left : isTypeofGlobal(test.right) ? test.right : undefined;
    const otherSide = typeofSide === test.left ? test.right : test.left;
    if (!typeofSide || !isUndefinedLiteral(otherSide)) return false;
    // typeof window !== "undefined" is browser when truthy; === "undefined" is browser when falsy.
    return isInequality !== negated;
  }
  return false;
};

const alwaysExits = (statement: EsTreeNode | undefined): boolean => {
  if (!statement) return false;
  if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") return true;
  if (statement.type === "BlockStatement") return alwaysExits(statement.body?.[statement.body.length - 1]);
  return false;
};

const calleeName = (call: EsTreeNode): string | undefined => {
  const callee = call.callee;
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
    return callee.property.name;
  }
  return undefined;
};

const findProperty = (options: EsTreeNode, name: string): EsTreeNode | undefined =>
  options.properties?.find(
    (property: EsTreeNode) => property.type === "Property" && !property.computed && property.key?.name === name,
  );

const isLiteral = (node: EsTreeNode | undefined, value: unknown): boolean => node?.type === "Literal" && node.value === value;

// Vue skips these watchers during SSR: `watch` without `immediate`, and post-flush effects.
const isSsrSkippedWatcherCallback = (call: EsTreeNode, argumentIndex: number): boolean => {
  const name = calleeName(call);
  const options: EsTreeNode | undefined = call.arguments?.[argumentIndex + 1];
  if (name === "watchPostEffect") return argumentIndex === 0;
  if (name === "watchEffect") {
    return argumentIndex === 0 && options?.type === "ObjectExpression" && isLiteral(findProperty(options, "flush")?.value, "post");
  }
  if (name !== "watch" || argumentIndex !== 1) return false;
  if (!options) return true;
  if (options.type !== "ObjectExpression") return false;
  if (options.properties.some((property: EsTreeNode) => property.type !== "Property")) return false;
  const immediate = findProperty(options, "immediate");
  if (immediate && !isLiteral(immediate.value, false)) return false;
  return !isLiteral(findProperty(options, "flush")?.value, "sync");
};

// Is `argument` of `call` a callback that only ever runs in the browser?
const isClientOnlyCallback = (call: EsTreeNode, argument: EsTreeNode): boolean => {
  if (call.type !== "CallExpression") return false;
  const argumentIndex: number = call.arguments?.indexOf(argument) ?? -1;
  if (argumentIndex === -1) return false;
  const name = calleeName(call);
  if (!name) return false;
  if (call.callee.type === "Identifier" && CLIENT_ONLY_CALLBACK_HOOKS.has(name)) return true;
  if (call.callee.type === "MemberExpression" && EVENT_LISTENER_METHODS.has(name)) return argumentIndex === 1;
  return call.callee.type === "Identifier" && isSsrSkippedWatcherCallback(call, argumentIndex);
};

// The name a function can be called by: `function f() {}`, `const f = () => {}`, `const f = useDebounceFn(() => {})`.
const getBinding = (fn: EsTreeNode): EsTreeNode | undefined => {
  if (fn.type === "FunctionDeclaration") return fn.id ?? undefined;
  let holder = fn.parent;
  if (holder?.type === "CallExpression" && holder.arguments?.[0] === fn) {
    const name = calleeName(holder);
    if (!name || !DEFERRING_WRAPPERS.has(name)) return undefined;
    holder = holder.parent;
  } else if (holder?.type !== "VariableDeclarator") {
    return undefined;
  }
  return holder?.type === "VariableDeclarator" && holder.id?.type === "Identifier" ? holder.id : undefined;
};

const isReference = (identifier: EsTreeNode): boolean => {
  const parent = identifier.parent;
  if (parent?.type === "MemberExpression" && parent.property === identifier && !parent.computed) return false;
  if ((parent?.type === "Property" || parent?.type === "MethodDefinition") && parent.key === identifier) {
    return parent.type === "Property" && parent.shorthand === true;
  }
  return true;
};

const isInside = (node: EsTreeNode, ancestor: EsTreeNode): boolean => {
  for (let current = node.parent; current; current = current.parent) if (current === ancestor) return true;
  return false;
};

class ClientScopeAnalysis {
  private references: Map<string, EsTreeNode[]> | null = null;
  private template: TemplateIndex | null = null;
  private readonly functionVerdicts = new Map<EsTreeNode, boolean>();

  constructor(private readonly filename: string) {}

  // Is `node` inside a region that only runs in the browser?
  isClientOnly(node: EsTreeNode): boolean {
    let child: EsTreeNode = node;
    for (let current = node.parent; current; child = current, current = current.parent) {
      if (current.type === "IfStatement" || current.type === "ConditionalExpression") {
        if (child === current.consequent && impliesBrowser(current.test, false, this.resolveGuard)) return true;
        if (child === current.alternate && impliesBrowser(current.test, true, this.resolveGuard)) return true;
      }
      if (current.type === "LogicalExpression" && child === current.right) {
        if (current.operator === "&&" && impliesBrowser(current.left, false, this.resolveGuard)) return true;
        if (current.operator === "||" && impliesBrowser(current.left, true, this.resolveGuard)) return true;
      }
      if (current.type === "BlockStatement" || current.type === "Program") {
        // Early exit: `if (!import.meta.client) return` guards every later statement.
        const body: EsTreeNode[] = current.body ?? [];
        const position = body.indexOf(child);
        for (let index = 0; index < position; index++) {
          const statement = body[index];
          if (
            statement.type === "IfStatement" &&
            !statement.alternate &&
            alwaysExits(statement.consequent) &&
            impliesBrowser(statement.test, true, this.resolveGuard)
          ) {
            return true;
          }
        }
      }
      if (isFunctionNode(current)) {
        if (current.parent && isClientOnlyCallback(current.parent, current)) return true;
        if (this.isClientOnlyFunction(current)) return true;
      }
    }
    return false;
  }

  // Browser-only when every use is: called or passed from browser-only code, or a template event handler.
  private isClientOnlyFunction(fn: EsTreeNode): boolean {
    const cached = this.functionVerdicts.get(fn);
    if (cached !== undefined) return cached;
    this.functionVerdicts.set(fn, false);

    const binding = getBinding(fn);
    if (!binding) return false;
    const templateUsage = this.getTemplate().usage(binding.name);
    if (templateUsage === "render") return false;
    // Uses inside the function itself (recursion, re-scheduling) say nothing about who calls it first.
    const references = (this.getReferences(binding).get(binding.name) ?? []).filter(
      (reference) => reference !== binding && !isInside(reference, fn),
    );
    if (references.length === 0 && templateUsage === "none") return false;

    const verdict = references.every((reference) => {
      const parent = reference.parent;
      if (parent?.type === "CallExpression" && parent.callee === reference) return this.isClientOnly(parent);
      if (parent?.type === "CallExpression" && isClientOnlyCallback(parent, reference)) return true;
      return this.isClientOnly(reference);
    });
    this.functionVerdicts.set(fn, verdict);
    return verdict;
  }

  private readonly resolveGuard: GuardResolver = (test) => {
    const name = test.type === "Identifier" ? test.name : test.callee?.type === "Identifier" ? test.callee.name : undefined;
    if (!name) return undefined;
    for (const reference of this.getReferences(test).get(name) ?? []) {
      const declaration = reference.parent;
      if (test.type === "Identifier") {
        const isConst = declaration?.type === "VariableDeclarator" && declaration.id === reference && declaration.parent?.kind === "const";
        if (isConst) return declaration.init ?? undefined;
        continue;
      }
      const fn =
        declaration?.type === "FunctionDeclaration" && declaration.id === reference
          ? declaration
          : declaration?.type === "VariableDeclarator" && declaration.id === reference && isFunctionNode(declaration.init)
            ? declaration.init
            : undefined;
      if (!fn) continue;
      if (fn.body?.type !== "BlockStatement") return fn.body;
      const [statement] = fn.body.body ?? [];
      return fn.body.body?.length === 1 && statement.type === "ReturnStatement" ? statement.argument : undefined;
    }
    return undefined;
  };

  private getReferences(anyNode: EsTreeNode): Map<string, EsTreeNode[]> {
    if (this.references) return this.references;
    let root = anyNode;
    while (root.parent) root = root.parent;
    const references = new Map<string, EsTreeNode[]>();
    walkAst(root, (child) => {
      if (child.type !== "Identifier" || !isReference(child)) return;
      const list = references.get(child.name);
      if (list) list.push(child);
      else references.set(child.name, [child]);
    });
    this.references = references;
    return references;
  }

  private getTemplate(): TemplateIndex {
    this.template ??= indexTemplate(this.filename);
    return this.template;
  }
}

export default defineRule({
  meta: {
    id: "nuxt-no-window-in-ssr",
    category: "Nuxt",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "1.0.0",
    help: "Guard browser globals with `if (import.meta.client)` or access them inside `onMounted()`",
    agentGuidance: "Browser globals do not exist during SSR. Guard access with `if (import.meta.client)` or move it into `onMounted()`. Code that only runs from client-only places is already fine: lifecycle hooks other than setup, template event handlers, DOM event listeners, `watch` callbacks without `immediate`, post-flush effects, `*.client.*` files and pages with `ssr: false` in `routeRules`. A function that is exported or returned from a composable cannot be traced to its callers; guard it inside.",
  },
  create: (context: RuleContext): RuleVisitors => {
    const filename = getFilename(context);
    // `*.client.*` files and pages with `ssr: false` are never rendered or executed on the server.
    if (CLIENT_FILE_PATTERN.test(filename) || isClientRenderedPage(context)) return {};
    const analysis = new ClientScopeAnalysis(filename);

    return {
      MemberExpression(node: EsTreeNode) {
        if (node.object?.type !== "Identifier" || !SSR_UNSAFE_GLOBALS.has(node.object.name)) return;
        if (analysis.isClientOnly(node)) return;

        context.report({
          node,
          message: `${node.object.name} is not available during SSR — guard with \`if (import.meta.client)\` or use \`onMounted()\``,
        });
      },
    };
  },
});
