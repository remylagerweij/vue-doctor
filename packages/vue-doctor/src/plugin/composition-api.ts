import { getStaticKeyName, isFunctionNode, isSetupFunction, walkAst, WALK_SKIP } from "./helpers.js";
import type { EsTreeNode } from "./types.js";

// Shared analysis for the Composition API rules: which calls are Vue's own API (imported or
// auto-imported, never a local namesake), and whether a call runs while the component instance is
// still active (synchronously in setup) or later (after an `await`, in a timer or promise callback).

/** Modules the Composition API is imported from; Nuxt (`#imports`) and vue-demi re-export it. */
const VUE_SOURCES = new Set(["vue", "@vue/runtime-core", "@vue/runtime-dom", "@vue/composition-api", "vue-demi", "#imports"]);

export const LIFECYCLE_HOOKS = new Set([
  "onBeforeMount",
  "onMounted",
  "onBeforeUpdate",
  "onUpdated",
  "onBeforeUnmount",
  "onUnmounted",
  "onActivated",
  "onDeactivated",
  "onErrorCaptured",
  "onRenderTracked",
  "onRenderTriggered",
  "onServerPrefetch",
]);

/**
 * Vue APIs that need the active component instance: without one they warn and do nothing
 * (lifecycle hooks, `provide`), return `undefined` (`inject`) or throw (`useModel`).
 */
const VUE_INSTANCE_APIS = new Set([
  ...LIFECYCLE_HOOKS,
  "provide",
  "inject",
  "useSlots",
  "useAttrs",
  "useTemplateRef",
  "useId",
  "useModel",
]);

/** Library composables that read the instance's injection context; only matched when imported from the library. */
const LIBRARY_INSTANCE_APIS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["vue-router", new Set(["useRoute", "useRouter", "useLink", "onBeforeRouteLeave", "onBeforeRouteUpdate"])],
  ["vue-i18n", new Set(["useI18n"])],
]);

const VUE_WATCHERS = new Set(["watch", "watchEffect", "watchPostEffect", "watchSyncEffect"]);

/** Vue APIs the rules resolve; any other Vue import is ignored. */
const VUE_KNOWN_APIS = new Set([
  ...VUE_INSTANCE_APIS,
  ...VUE_WATCHERS,
  "reactive",
  "shallowReactive",
  "ref",
  "shallowRef",
  "defineProps",
  "withDefaults",
  "defineComponent",
]);

export type ApiKind = "instance" | "watcher" | "other";

export interface ResolvedApi {
  /** The API's exported name (`onMounted`), also when it was imported under an alias. */
  name: string;
  kind: ApiKind;
}

const kindOf = (name: string, source: string | null): ApiKind | null => {
  if (source === null || VUE_SOURCES.has(source)) {
    if (VUE_INSTANCE_APIS.has(name)) return "instance";
    if (VUE_WATCHERS.has(name)) return "watcher";
    return VUE_KNOWN_APIS.has(name) ? "other" : null;
  }
  return LIBRARY_INSTANCE_APIS.get(source)?.has(name) ? "instance" : null;
};

/** Every name a pattern binds: `a`, `{ a, b: c }`, `[d, ...e]`, `f = 1`. */
export const collectPatternNames = (pattern: EsTreeNode | null | undefined, names: string[] = []): string[] => {
  if (!pattern) return names;
  switch (pattern.type) {
    case "Identifier":
      names.push(pattern.name);
      break;
    case "ObjectPattern":
      for (const property of pattern.properties ?? []) {
        collectPatternNames(property.type === "RestElement" ? property.argument : property.value, names);
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements ?? []) collectPatternNames(element, names);
      break;
    case "AssignmentPattern":
      collectPatternNames(pattern.left, names);
      break;
    case "RestElement":
      collectPatternNames(pattern.argument, names);
      break;
    case "TSParameterProperty":
      collectPatternNames(pattern.parameter, names);
      break;
  }
  return names;
};

export interface ApiResolver {
  /** The Vue (or router / i18n) API a callee refers to, or `null` for anything else. */
  resolve: (callee: EsTreeNode | null | undefined) => ResolvedApi | null;
  /** Every declarator in the file whose id is a plain identifier, by name. */
  declarators: ReadonlyMap<string, EsTreeNode[]>;
}

/**
 * Indexes a file once: imports by local name, and every name the file binds itself. A call is
 * Vue's API when its identifier is imported from Vue, or is not bound anywhere in the file
 * (auto-imported by Nuxt or unplugin-auto-import). A name the file also binds locally (a parameter
 * `({ provide }) => ...`, a helper `const inject = ...`) is never resolved: precision over recall.
 */
export const createApiResolver = (program: EsTreeNode): ApiResolver => {
  const imports = new Map<string, { source: string; imported: string }>();
  const localBindings = new Set<string>();
  const declarators = new Map<string, EsTreeNode[]>();

  walkAst(program, (node) => {
    switch (node.type) {
      case "ImportDeclaration":
        for (const specifier of node.specifiers ?? []) {
          const local = specifier.local?.name;
          if (typeof local !== "string") continue;
          const imported =
            specifier.type === "ImportSpecifier"
              ? (specifier.imported?.name ?? specifier.imported?.value ?? local)
              : specifier.type === "ImportDefaultSpecifier"
                ? "default"
                : "*";
          if (imports.has(local)) localBindings.add(local);
          imports.set(local, { source: String(node.source?.value ?? ""), imported });
        }
        return WALK_SKIP;
      case "VariableDeclarator":
        for (const name of collectPatternNames(node.id)) localBindings.add(name);
        if (node.id?.type === "Identifier") {
          declarators.set(node.id.name, [...(declarators.get(node.id.name) ?? []), node]);
        }
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (node.id?.name) localBindings.add(node.id.name);
        for (const parameter of node.params ?? []) {
          for (const name of collectPatternNames(parameter)) localBindings.add(name);
        }
        break;
      case "ClassDeclaration":
        if (node.id?.name) localBindings.add(node.id.name);
        break;
      case "CatchClause":
        for (const name of collectPatternNames(node.param)) localBindings.add(name);
        break;
    }
  });

  const resolve = (callee: EsTreeNode | null | undefined): ResolvedApi | null => {
    if (callee?.type !== "Identifier") return null;
    const name: string = callee.name;
    if (localBindings.has(name)) return null;
    const imported = imports.get(name);
    if (imported) {
      const kind = kindOf(imported.imported, imported.source);
      return kind ? { name: imported.imported, kind } : null;
    }
    const kind = kindOf(name, null);
    return kind ? { name, kind } : null;
  };

  return { resolve, declarators };
};

const TRANSPARENT_WRAPPERS = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "ParenthesizedExpression",
  "ChainExpression",
]);

/** Strips TypeScript casts, parentheses and optional-chain wrappers. */
export const peel = (node: EsTreeNode | null | undefined): EsTreeNode | null => {
  let current = node ?? null;
  while (current && TRANSPARENT_WRAPPERS.has(current.type) && current.expression) current = current.expression;
  return current;
};

const startOf = (node: EsTreeNode): number => (node.range?.[0] ?? node.start) as number;
const endOf = (node: EsTreeNode): number => (node.range?.[1] ?? node.end) as number;

const contains = (outer: EsTreeNode, inner: EsTreeNode): boolean =>
  startOf(outer) <= startOf(inner) && endOf(inner) <= endOf(outer);

const nearestFunction = (node: EsTreeNode): EsTreeNode | null => {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunctionNode(current)) return current;
  }
  return null;
};

const bindsName = (pattern: EsTreeNode | null | undefined, name: string): boolean => {
  if (!pattern) return false;
  switch (pattern.type) {
    case "Identifier":
      return pattern.name === name;
    case "AssignmentPattern":
      return bindsName(pattern.left, name);
    case "RestElement":
      return bindsName(pattern.argument, name);
    case "TSParameterProperty":
      return bindsName(pattern.parameter, name);
    case "ArrayPattern":
      return (pattern.elements ?? []).some((element: EsTreeNode) => bindsName(element, name));
    case "ObjectPattern":
      return (pattern.properties ?? []).some((property: EsTreeNode) =>
        bindsName(property.type === "Property" ? property.value : property, name),
      );
    default:
      return false;
  }
};

/**
 * The declarators of `name` that are in scope at `at`: declared at the top level or in a function
 * enclosing `at`. Empty when a closer function parameter binds the same name (it shadows them).
 */
export const visibleDeclarators = (name: string, at: EsTreeNode, resolver: ApiResolver): EsTreeNode[] => {
  for (let current = at.parent; current; current = current.parent) {
    if (isFunctionNode(current) && (current.params ?? []).some((param: EsTreeNode) => bindsName(param, name))) return [];
  }
  return (resolver.declarators.get(name) ?? []).filter((declarator) => {
    const owner = nearestFunction(declarator);
    return owner === null || contains(owner, at);
  });
};

const calleeName = (call: EsTreeNode | null | undefined): string | null => {
  const callee = peel(call?.callee);
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression" && !callee.computed) return callee.property?.name ?? null;
  return null;
};

/** The call a function is passed to as an argument, when it is one. */
const callTakingFunction = (fn: EsTreeNode): EsTreeNode | null => {
  const parent = fn.parent;
  return parent?.type === "CallExpression" && (parent.arguments ?? []).includes(fn) ? parent : null;
};

// Nuxt restores its context after `await` in these (its async-context transform), so they are left alone.
const NUXT_ASYNC_CONTEXT_CALLS = new Set(["defineNuxtPlugin", "defineNuxtRouteMiddleware", "defineNuxtComponent", "definePageMeta"]);

const isInNuxtAsyncContext = (fn: EsTreeNode): boolean => {
  const direct = callTakingFunction(fn);
  if (direct && NUXT_ASYNC_CONTEXT_CALLS.has(calleeName(direct) ?? "")) return true;
  // `defineNuxtComponent({ async setup() {} })`, `definePageMeta({ middleware: async () => {} })`
  const owner = fn.parent;
  if (owner?.type !== "Property" && owner?.type !== "MethodDefinition") return false;
  const objectCall = owner.parent?.type === "ObjectExpression" ? owner.parent.parent : null;
  return objectCall?.type === "CallExpression" && NUXT_ASYNC_CONTEXT_CALLS.has(calleeName(objectCall) ?? "");
};

const EXITS = new Set(["ReturnStatement", "ThrowStatement", "BreakStatement", "ContinueStatement"]);

const endsByLeaving = (branch: EsTreeNode): boolean => {
  if (EXITS.has(branch.type)) return true;
  const body: EsTreeNode[] | undefined = branch.type === "BlockStatement" ? branch.body : branch.type === "SwitchCase" ? branch.consequent : undefined;
  const last = body?.[body.length - 1];
  return Boolean(last && EXITS.has(last.type));
};

/**
 * Whether the `await` necessarily ran before `call` on the path that reaches `call`. It does not
 * when the await is inside the call's own callee, in a `return`/`throw`, in a branch that leaves
 * the function (`if (x) { await y; return }`), or in the other arm of an if/ternary.
 */
const awaitPrecedes = (awaitNode: EsTreeNode, call: EsTreeNode): boolean => {
  const awaitStart = startOf(awaitNode);
  const isInArguments = (call.arguments ?? []).some((argument: EsTreeNode) => contains(argument, awaitNode));
  if (!isInArguments) {
    if (awaitStart >= startOf(call)) return false;
    // An await around the call (`await connect(inject("url"))`) evaluates the call before suspending.
    if (contains(awaitNode, call)) return false;
  }
  for (let current: EsTreeNode | null = awaitNode; current && !contains(current, call); current = current.parent) {
    if (current.type === "ReturnStatement" || current.type === "ThrowStatement") return false;
    const parent: EsTreeNode | undefined = current.parent;
    if (!parent) break;
    if (parent.type === "IfStatement" && (current === parent.consequent || current === parent.alternate)) {
      if (endsByLeaving(current)) return false;
      if (contains(parent, call)) return false; // the call is in the other arm
    }
    if (parent.type === "ConditionalExpression" && current !== parent.test && contains(parent, call)) return false;
    if (parent.type === "SwitchStatement" && current.type === "SwitchCase") {
      if (endsByLeaving(current) || contains(parent, call)) return false;
    }
    if (parent.type === "TryStatement" && current === parent.handler && contains(parent, call)) return false;
  }
  return true;
};

/**
 * The first `await` (or `for await`) that runs before `call` in the call's own async function,
 * when there is one. Awaits in nested functions do not count, and neither does top-level `await`
 * in `<script setup>`: the compiler restores the instance there (`withAsyncContext`).
 */
export const findPrecedingAwait = (call: EsTreeNode): EsTreeNode | null => {
  const fn = nearestFunction(call);
  if (!fn?.async || isInNuxtAsyncContext(fn)) return null;
  let found: EsTreeNode | null = null;
  walkAst(fn.body, (node) => {
    if (found) return WALK_SKIP;
    if (isFunctionNode(node)) return WALK_SKIP;
    if (node.type === "AwaitExpression" && awaitPrecedes(node, call)) {
      found = node;
      return WALK_SKIP;
    }
    // `for await (const x of y)`: the loop body and everything after it run after an await.
    if (node.type === "ForOfStatement" && node.await && node.right && !contains(node.right, call) && awaitPrecedes(node.right, call)) {
      found = node;
    }
    return undefined;
  });
  return found;
};

const TIMER_CALLS = new Set(["setTimeout", "setInterval", "requestAnimationFrame", "requestIdleCallback", "queueMicrotask"]);
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);
const PROMISE_METHODS = new Set(["then", "catch", "finally"]);

const isTruthyOption = (options: EsTreeNode | undefined, key: string): boolean =>
  options?.type === "ObjectExpression" &&
  (options.properties ?? []).some(
    (property: EsTreeNode) =>
      property.type === "Property" &&
      getStaticKeyName(property) === key &&
      !(property.value?.type === "Literal" && property.value.value === false),
  );

/**
 * What a function is passed to when it runs later, outside setup: a timer, `nextTick`, a promise
 * reaction, an event listener or a `watch` callback (not `immediate`, whose first run is in setup).
 */
const deferringCallOf = (fn: EsTreeNode, resolver: ApiResolver): string | null => {
  const call = callTakingFunction(fn);
  if (!call) return null;
  const callee = peel(call.callee);
  const index = call.arguments.indexOf(fn);
  if (callee?.type === "Identifier") {
    if ((TIMER_CALLS.has(callee.name) || callee.name === "nextTick") && index === 0) return callee.name;
    const api = resolver.resolve(callee);
    if (api?.name === "watch" && index === 1 && !isTruthyOption(call.arguments[2], "immediate")) return "watch";
    return null;
  }
  if (callee?.type !== "MemberExpression" || callee.computed) return null;
  const method: string | undefined = callee.property?.name;
  if (!method) return null;
  if (PROMISE_METHODS.has(method)) return `.${method}()`;
  if ((method === "nextTick" || method === "$nextTick") && index === 0) return method;
  if (method === "addEventListener" && index === 1) return "addEventListener";
  if (TIMER_CALLS.has(method) && index === 0 && callee.object?.type === "Identifier" && GLOBAL_OBJECTS.has(callee.object.name)) {
    return method;
  }
  return null;
};

// Callbacks that restore an injection context (`app.runWithContext`) or own the watchers created
// in them (`scope.run` of an effectScope); nothing inside them is reported.
const CONTEXT_RESTORING_METHODS = new Set(["runWithContext", "runInInjectionContext", "run", "callWithNuxt"]);

const isDefineComponentSetupArrow = (fn: EsTreeNode): boolean => {
  const parent = fn.parent;
  return parent?.type === "CallExpression" && parent.arguments?.[0] === fn && calleeName(parent) === "defineComponent";
};

/**
 * The API a function enclosing `call` hands it to for a later run (`setTimeout`, `.then()`, ...),
 * or `null` when every enclosing function runs synchronously in setup.
 */
export const findDeferringCall = (call: EsTreeNode, resolver: ApiResolver): string | null => {
  for (let current = call.parent; current; current = current.parent) {
    if (!isFunctionNode(current)) continue;
    // A component's own setup() runs with its own instance, even when the component is created or
    // mounted from a timer or promise callback further out.
    if (isSetupFunction(current) || isDefineComponentSetupArrow(current)) return null;
    const taking = callTakingFunction(current);
    if (taking && CONTEXT_RESTORING_METHODS.has(calleeName(taking) ?? "")) return null;
    const deferring = deferringCallOf(current, resolver);
    if (deferring) return deferring;
  }
  return null;
};

const GUARD_CALLS = new Set(["getCurrentInstance", "hasInjectionContext", "getCurrentScope", "tryUseNuxtApp"]);

const containsGuardCall = (node: EsTreeNode): boolean => {
  let found = false;
  walkAst(node, (child) => {
    if (child.type === "CallExpression" && GUARD_CALLS.has(calleeName(child) ?? "")) found = true;
  });
  return found;
};

const isNullish = (node: EsTreeNode | null): boolean =>
  node?.type === "Literal" ? node.value === null : node?.type === "Identifier" && node.name === "undefined";

/**
 * Whether `test` evaluating to `truthy` proves an instance exists: `getCurrentInstance()` when
 * truthy, `!getCurrentInstance()` when falsy, `a && check` when truthy, `a || check` when falsy.
 * Anything it cannot prove (`cond || getCurrentInstance()`, `check === null` when truthy) is false.
 */
const impliesInstance = (test: EsTreeNode | null, truthy: boolean): boolean => {
  const node = peel(test);
  if (!node) return false;
  if (node.type === "UnaryExpression" && node.operator === "!") return impliesInstance(node.argument, !truthy);
  if (node.type === "LogicalExpression" && (node.operator === "&&" || node.operator === "||")) {
    const either = (node.operator === "&&") === truthy;
    const left = impliesInstance(node.left, truthy);
    const right = impliesInstance(node.right, truthy);
    return either ? left || right : left && right;
  }
  if (node.type === "BinaryExpression" && ["==", "===", "!=", "!=="].includes(node.operator)) {
    const operand = isNullish(peel(node.right)) ? node.left : isNullish(peel(node.left)) ? node.right : null;
    if (!operand) return false;
    // `check != null` is truthy exactly when the instance exists.
    return impliesInstance(operand, node.operator.startsWith("!") === truthy);
  }
  // `getCurrentInstance()`, `getCurrentInstance()?.proxy`: truthy proves it, falsy proves nothing.
  return truthy && containsGuardCall(node);
};

/**
 * Whether the call sits in the branch an instance check lets through: the consequent of
 * `if (getCurrentInstance())` or `check ? ... : ...`, or the right of `check && ...`. The `else`
 * branch, the alternate of a ternary and the right of `||` are not guarded.
 */
export const isGuardedByInstanceCheck = (call: EsTreeNode): boolean => {
  let child: EsTreeNode = call;
  for (let current = call.parent; current && !isFunctionNode(current); child = current, current = current.parent) {
    if (current.type === "IfStatement" || current.type === "ConditionalExpression") {
      if (child === current.consequent && impliesInstance(current.test, true)) return true;
      if (child === current.alternate && impliesInstance(current.test, false)) return true;
    } else if (current.type === "LogicalExpression" && child === current.right) {
      if (current.operator === "&&" && impliesInstance(current.left, true)) return true;
      if (current.operator === "||" && impliesInstance(current.left, false)) return true;
    }
  }
  return false;
};

const COMPONENT_DEFINERS = new Set(["defineComponent", "defineNuxtComponent", "defineCustomElement", "extend"]);
const COMPONENT_OPTION_KEYS = new Set(["props", "emits", "components", "template", "render", "inheritAttrs", "directives", "expose", "slots"]);

/**
 * Whether `fn` is the `setup()` of a Vue component: an object passed to `defineComponent()`, the
 * default export of a `.vue` file, or an object with other component options (`props`, `emits`, ...).
 * Other objects with a `setup` method (esbuild/Vite plugins, test runners) are not components.
 */
export const isComponentSetup = (fn: EsTreeNode, filename: string): boolean => {
  if (!isSetupFunction(fn)) return false;
  const object = fn.parent?.parent;
  if (object?.type !== "ObjectExpression") return false;
  const owner = object.parent;
  if (owner?.type === "CallExpression" && owner.arguments?.[0] === object && COMPONENT_DEFINERS.has(calleeName(owner) ?? "")) return true;
  if (owner?.type === "ExportDefaultDeclaration" && filename.endsWith(".vue")) return true;
  return (object.properties ?? []).some(
    (property: EsTreeNode) => property.type === "Property" && COMPONENT_OPTION_KEYS.has(getStaticKeyName(property) ?? ""),
  );
};

/** Whether a call stores or hands on its return value (`const stop = watch(...)`, `return watch(...)`). */
export const isResultUsed = (call: EsTreeNode): boolean => {
  let current: EsTreeNode = call;
  while (current.parent && TRANSPARENT_WRAPPERS.has(current.parent.type)) current = current.parent;
  const parent = current.parent;
  if (!parent) return false;
  if (parent.type === "ExpressionStatement") return false;
  if (parent.type === "UnaryExpression" && parent.operator === "void") return false;
  return true;
};

const COMPOSABLE_NAME = /^use[A-Z0-9_]/;

/** Name a function is known by: `function useX`, `const useX = () => {}`, `useX: () => {}`, `useX() {}`. */
export const functionNameOf = (fn: EsTreeNode): string | null => {
  if (fn.id?.name) return fn.id.name;
  const parent = fn.parent;
  if (parent?.type === "VariableDeclarator" && parent.init === fn && parent.id?.type === "Identifier") return parent.id.name;
  if ((parent?.type === "Property" || parent?.type === "MethodDefinition") && parent.value === fn) return getStaticKeyName(parent);
  return null;
};

export const isComposableName = (name: string | null): boolean => name !== null && COMPOSABLE_NAME.test(name);

/**
 * Whether code runs on behalf of a component: anywhere in a `.vue` file, or inside a composable
 * (`useX`) or a component `setup()`. App bootstrap code (`main.ts`, plugins, router guards) is not:
 * a watcher created there lives as long as the app on purpose.
 */
export const isInComponentContext = (node: EsTreeNode, filename: string): boolean => {
  if (filename.endsWith(".vue")) return true;
  for (let current = node.parent; current; current = current.parent) {
    if (!isFunctionNode(current)) continue;
    if (isComposableName(functionNameOf(current)) || isComponentSetup(current, filename)) return true;
  }
  return false;
};
