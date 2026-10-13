import { getFilename, getRuleOptions, getStringListOption, walkAst } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import { isRawReaderCall, isServerHandlerFile } from "../../server-input.js";
import { memberPath, peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

/** Names of calls that validate or coerce their argument: `schema.parse(x)`, `S.safeParse(x)`, `assertValid(x)`, `verifyWebhook(x)`... */
const VALIDATOR_PATTERN = /valid|parse|assert|schema|sanitiz|verif|signature|check|decode|^cast$|^coerce$|^constructEvent(?:Async)?$/i;
/** `isEmail(x)`, `isUUID(x)`: case-sensitive, so `issue()` or `isolate()` are not type guards. */
const TYPE_GUARD_PATTERN = /^is[A-Z0-9_]/;
/** Coercions that reject anything but the expected type (`Number(getRouterParam(...))` then compared with `Number.isNaN`). */
const COERCION_FUNCTIONS: ReadonlySet<string> = new Set(["Number", "parseInt", "parseFloat", "BigInt", "Boolean"]);
/** Operators and methods that test a value, which counts as validating it by hand. */
const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(["===", "!==", "==", "!="]);
const TEST_METHODS: ReadonlySet<string> = new Set(["includes", "has", "startsWith", "endsWith", "test", "match"]);
/** Promise methods whose result is still the read (`readBody(event).catch(() => ({}))`). */
const PROMISE_METHODS: ReadonlySet<string> = new Set(["catch", "then", "finally"]);
/** Route params are always strings, so a presence check plus a throw is enough to reject a missing one. */
const ROUTER_PARAM_READERS: ReadonlySet<string> = new Set(["getRouterParam", "getRouterParams"]);
const HEADER_READERS: ReadonlySet<string> = new Set(["getHeader", "getRequestHeader"]);

const calleeName = (callee: EsTreeNode): string | null => {
  const node = peel(callee);
  if (node.type === "Identifier") return node.name;
  return node.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier" ? node.property.name : null;
};

/** Names a declarator/assignment target binds (`body`, `{ name, age }`). */
const boundNames = (target: EsTreeNode | undefined): string[] => {
  if (!target) return [];
  if (target.type === "Identifier") return [target.name];
  if (target.type === "AssignmentPattern") return boundNames(target.left);
  if (target.type === "ObjectPattern") {
    return (target.properties as EsTreeNode[]).flatMap((property) => boundNames(property.type === "RestElement" ? property.argument : property.value));
  }
  if (target.type === "ArrayPattern") return (target.elements as (EsTreeNode | null)[]).flatMap((element) => boundNames(element ?? undefined));
  return [];
};

/** Parent chain steps that do not change what an expression is (`await x`, `x as T`, `x!`, `(x)`, `x?.y` chains, `x ?? fallback`). */
const TRANSPARENT_PARENTS = new Set([
  "AwaitExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "ParenthesizedExpression",
  "ChainExpression",
  "LogicalExpression",
]);

const isFunction = (node: EsTreeNode | null | undefined): boolean =>
  node?.type === "FunctionDeclaration" || node?.type === "FunctionExpression" || node?.type === "ArrowFunctionExpression";

/** Whether an `if` branch ends the request: `throw ...` or `return sendError(...)` / `return createError(...)`. */
const rejects = (statement: EsTreeNode | null | undefined): boolean => {
  if (!statement) return false;
  if (statement.type === "ThrowStatement") return true;
  if (statement.type === "ReturnStatement" && statement.argument?.type === "CallExpression") {
    return /^(?:sendError|createError)$/.test(calleeName(statement.argument.callee) ?? "");
  }
  return statement.type === "BlockStatement" && (statement.body as EsTreeNode[]).some(rejects);
};

/** The operands an `if` test checks for presence: `!id`, `id == null`, `!a || !b`. */
const presenceOperands = (test: EsTreeNode): EsTreeNode[] => {
  const expression = peel(test);
  if (expression.type === "UnaryExpression" && expression.operator === "!") return [expression.argument];
  if (expression.type === "LogicalExpression") return [...presenceOperands(expression.left), ...presenceOperands(expression.right)];
  if (expression.type === "BinaryExpression" && COMPARISON_OPERATORS.has(expression.operator)) return [expression.left, expression.right];
  return [];
};

interface Read {
  node: EsTreeNode;
  reader: string;
  validated: boolean;
}

export default defineRule({
  meta: {
    id: "require-input-validation",
    category: "Server",
    // Warning, medium confidence: validation may happen in a helper the handler delegates to, or in
    // middleware; the rule only looks for a validator, coercion or manual check within the same file.
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    cwe: ["CWE-20"],
    owasp: "A03:2021",
    fixable: false,
    since: "2.0.0",
    help: "Validate request input with `getValidatedQuery`/`readValidatedBody`/`getValidatedRouterParams` and a schema (zod, valibot), or run `schema.parse()` on it before use",
    agentGuidance:
      "Replace `getQuery(event)` with `getValidatedQuery(event, schema.parse)`, `readBody(event)` with `readValidatedBody(event, schema.parse)` and `getRouterParam(event, 'id')` with `getValidatedRouterParams(event, schema.parse)` " +
      "(zod, valibot or arktype schema; a TypeScript generic like `readBody<Foo>(event)` or a cast like `body as Foo` is not validation, it only asserts a type). Or keep the raw read and pass the result through `schema.parse(...)` / `safeParse` before using it, " +
      "throwing `createError({ statusCode: 400 })` on failure. A route param only needs a presence check that throws (`if (!id) throw createError({ statusCode: 400 })`), since it is always a string. " +
      "A single header read for authentication or forwarding can be compared against the expected value instead. If the project validates through its own helper (`parseBody(event, schema)`), list it in the rule's `validators` option.",
    options: {
      type: "object",
      properties: {
        validators: {
          type: "array",
          items: { type: "string" },
          description:
            "Names of project functions that validate what they are given, e.g. `[\"parseBody\", \"parseQuery\"]`. A raw read passed to one counts as validated.",
        },
      },
      additionalProperties: false,
    },
  },
  create: (context: RuleContext): RuleVisitors => {
    if (!isServerHandlerFile(getFilename(context))) return {};
    const extraValidators = new Set(getStringListOption(getRuleOptions(context), "validators"));

    const reads: Read[] = [];
    /** Names holding (a part of) raw reads; validating the name validates the reads. Later bindings replace earlier ones, which is right for source order. */
    const groups = new Map<string, Read[]>();
    /** Same-file functions by name, and calls to them with the reads their first argument carries. */
    const localFunctions = new Map<string, EsTreeNode>();
    const localCalls: { name: string; reads: Read[] }[] = [];

    /** The reads an expression is, or is derived from (`body.name`, `(parts ?? []).filter(...)`, `{ id: getRouterParam(e, "id") }`). */
    const readsOf = (node: EsTreeNode | null | undefined): Read[] => {
      if (!node) return [];
      const expression = peel(node);
      switch (expression.type) {
        case "AwaitExpression":
          return readsOf(expression.argument);
        case "Identifier":
          return groups.get(expression.name) ?? [];
        case "MemberExpression":
          return readsOf(expression.object);
        case "CallExpression": {
          if (isRawReaderCall(expression)) return reads.filter((read) => read.node === expression);
          // Method calls keep (a part of) their receiver: `.catch()`, `.trim()`, `.filter()`, `[0]`.
          const callee = peel(expression.callee);
          return callee.type === "MemberExpression" ? readsOf(callee.object) : [];
        }
        case "LogicalExpression":
          return [...readsOf(expression.left), ...readsOf(expression.right)];
        case "ConditionalExpression":
          return [...readsOf(expression.consequent), ...readsOf(expression.alternate)];
        case "ObjectExpression":
          return (expression.properties as EsTreeNode[]).flatMap((property) =>
            readsOf(property.type === "SpreadElement" ? property.argument : property.value),
          );
        case "ArrayExpression":
          return (expression.elements as (EsTreeNode | null)[]).flatMap((element) =>
            readsOf(element?.type === "SpreadElement" ? element.argument : element),
          );
        default:
          return [];
      }
    };

    const markValidated = (node: EsTreeNode | null | undefined): void => {
      for (const read of readsOf(node)) read.validated = true;
    };

    const isSignatureHeader = (read: Read): boolean => {
      const name = read.node.arguments?.[1];
      return HEADER_READERS.has(read.reader) && name?.type === "Literal" && typeof name.value === "string" && /signature/i.test(name.value);
    };

    /** Whether a call validates or coerces what it is given (`JSON.parse` neither validates nor narrows anything). */
    const isValidatingCall = (node: EsTreeNode): boolean => {
      const callee = peel(node.callee);
      const name = calleeName(callee);
      if (!name) return false;
      if (extraValidators.has(name) || COERCION_FUNCTIONS.has(name) || TYPE_GUARD_PATTERN.test(name)) return true;
      if (callee.type === "MemberExpression" && memberPath(callee.object)?.join(".") === "JSON") return false;
      if (VALIDATOR_PATTERN.test(name)) return true;
      // A call that is handed the signature header verifies the payload it is handed with it.
      return (node.arguments as EsTreeNode[]).some((argument) => readsOf(argument).some(isSignatureHeader));
    };

    /** Whether a same-file function checks its first parameter (`typeof body !== "object"`, `Schema.parse(body)`). */
    const narrowsFirstParameter = (fn: EsTreeNode): boolean => {
      let parameter: EsTreeNode | undefined = fn.params?.[0];
      if (parameter?.type === "AssignmentPattern") parameter = parameter.left;
      if (parameter?.type !== "Identifier") return false;
      const name: string = parameter.name;
      const isParameter = (node: EsTreeNode | null | undefined): boolean => Boolean(node) && memberPath(node!)?.[0] === name;
      let narrows = false;
      walkAst(fn.body, (child) => {
        if (narrows) return;
        if (child.type === "UnaryExpression" && child.operator === "typeof" && isParameter(child.argument)) narrows = true;
        else if (child.type === "BinaryExpression" && child.operator === "instanceof" && isParameter(child.left)) narrows = true;
        else if (child.type === "CallExpression" && isValidatingCall(child) && (child.arguments as EsTreeNode[]).some(isParameter)) narrows = true;
      });
      return narrows;
    };

    const recordFunction = (name: string | undefined, fn: EsTreeNode | null | undefined): void => {
      if (name && isFunction(fn)) localFunctions.set(name, fn!);
    };

    return {
      FunctionDeclaration(node: EsTreeNode) {
        recordFunction(node.id?.name, node);
      },

      CallExpression(node: EsTreeNode) {
        if (!isRawReaderCall(node)) return;
        const read: Read = { node, reader: calleeName(node.callee) ?? "", validated: false };
        reads.push(read);
        // Climb past transparent wrappers and `.catch()`/`.then()` to see where the value goes.
        let child: EsTreeNode = node;
        let parent: EsTreeNode | undefined = node.parent;
        for (;;) {
          if (parent && TRANSPARENT_PARENTS.has(parent.type)) {
            child = parent;
            parent = parent.parent;
          } else if (
            parent?.type === "MemberExpression" &&
            parent.object === child &&
            PROMISE_METHODS.has(calleeName(parent) ?? "") &&
            parent.parent?.type === "CallExpression" &&
            parent.parent.callee === parent
          ) {
            child = parent.parent;
            parent = child.parent;
          } else break;
        }
        if (parent?.type === "VariableDeclarator" && parent.init === child) {
          for (const name of boundNames(parent.id)) groups.set(name, [read]);
        } else if (parent?.type === "AssignmentExpression" && parent.right === child && parent.operator === "=") {
          for (const name of boundNames(parent.left)) groups.set(name, [read]);
        }
      },

      // Checks run on exit, once the reads nested in their arguments (`S.parse(await readBody(e))`) are known.
      "CallExpression:exit"(node: EsTreeNode) {
        if (isRawReaderCall(node)) return;
        if (isValidatingCall(node)) {
          for (const argument of node.arguments as EsTreeNode[]) markValidated(argument);
          return;
        }
        const callee = peel(node.callee);
        if (callee.type === "MemberExpression" && TEST_METHODS.has(calleeName(callee) ?? "")) {
          markValidated(callee.object);
          markValidated(node.arguments?.[0]);
        } else if (callee.type === "Identifier" && node.arguments?.length > 0) {
          localCalls.push({ name: callee.name, reads: readsOf(node.arguments[0]) });
        }
      },

      VariableDeclarator(node: EsTreeNode) {
        recordFunction(node.id?.type === "Identifier" ? node.id.name : undefined, node.init);
        // `const name = body.name` / `const { page } = query` / `const files = (parts ?? []).filter(...)`: the new names stand for the same reads.
        const init = node.init ? peel(node.init) : null;
        if (!init || init.type === "AwaitExpression" || isRawReaderCall(init)) return;
        const derived = readsOf(init);
        if (derived.length > 0) for (const name of boundNames(node.id)) groups.set(name, derived);
      },

      "BinaryExpression:exit"(node: EsTreeNode) {
        if (!COMPARISON_OPERATORS.has(node.operator)) return;
        markValidated(node.left);
        markValidated(node.right);
      },

      "UnaryExpression:exit"(node: EsTreeNode) {
        if (node.operator === "typeof") markValidated(node.argument);
      },

      // `switch (query.period) { case "7d": ...; default: ... }` is an allowlist.
      "SwitchStatement:exit"(node: EsTreeNode) {
        markValidated(node.discriminant);
      },

      "IfStatement:exit"(node: EsTreeNode) {
        if (!rejects(node.consequent)) return;
        for (const operand of presenceOperands(node.test)) {
          for (const read of readsOf(operand)) if (ROUTER_PARAM_READERS.has(read.reader)) read.validated = true;
        }
      },

      "Program:exit"() {
        for (const call of localCalls) {
          const fn = localFunctions.get(call.name);
          if (fn && narrowsFirstParameter(fn)) for (const read of call.reads) read.validated = true;
        }
        for (const read of reads) {
          if (read.validated) continue;
          context.report({
            node: read.node,
            message: `${read.reader || "request reader"}() input is used without validation — use getValidatedQuery/readValidatedBody/getValidatedRouterParams with a schema, or run schema.parse() on it`,
          });
        }
      },
    };
  },
});
