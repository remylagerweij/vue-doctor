import { getFilename } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import { isRawReaderCall, isServerHandlerFile } from "../../server-input.js";
import { memberPath, peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

/** Names of calls that validate or coerce their argument: `schema.parse(x)`, `v.safeParse(Schema, x)`, `assertValid(x)`, `isEmail(x)`... */
const VALIDATOR_PATTERN = /valid|parse|assert|schema|sanitiz|verify|check|decode|^is[A-Z0-9_]|^cast$|^coerce$/;
/** Coercions that reject anything but the expected type (`Number(getRouterParam(...))` then compared with `Number.isNaN`). */
const COERCION_FUNCTIONS: ReadonlySet<string> = new Set(["Number", "parseInt", "parseFloat", "BigInt", "Boolean"]);
/** Operators and methods that test a value, which counts as validating it by hand. */
const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(["===", "!==", "==", "!="]);
const TEST_METHODS: ReadonlySet<string> = new Set(["includes", "has", "startsWith", "endsWith", "test", "match"]);

const calleeName = (callee: EsTreeNode): string | null => {
  const node = peel(callee);
  if (node.type === "Identifier") return node.name;
  return node.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier" ? node.property.name : null;
};

/** Whether a call validates or coerces what it is given (`JSON.parse` neither validates nor narrows anything). */
const isValidatingCall = (node: EsTreeNode): boolean => {
  const callee = peel(node.callee);
  const name = calleeName(callee);
  if (!name) return false;
  if (COERCION_FUNCTIONS.has(name)) return true;
  if (callee.type === "MemberExpression" && memberPath(callee.object)?.join(".") === "JSON") return false;
  return VALIDATOR_PATTERN.test(name);
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

/** Root name of `body.user.name` / `body?.user` / `body`. */
const rootName = (node: EsTreeNode | null | undefined): string | null => memberPath(node)?.[0] ?? null;

/** Parent chain steps that do not change what an expression is (`await x`, `x as T`, `x!`, `(x)`, `x?.y` chains). */
const TRANSPARENT_PARENTS = new Set(["AwaitExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "ParenthesizedExpression", "ChainExpression"]);

interface Read {
  node: EsTreeNode;
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
      "(zod, valibot or arktype schema; a TypeScript generic like `readBody<Foo>(event)` is not validation, it only asserts a type). Or keep the raw read and pass the result through `schema.parse(...)` / `safeParse` before using it, " +
      "throwing `createError({ statusCode: 400 })` on failure. A single header read for authentication or forwarding can be compared against the expected value instead.",
  },
  create: (context: RuleContext): RuleVisitors => {
    if (!isServerHandlerFile(getFilename(context))) return {};

    const reads: Read[] = [];
    /** Names holding (a part of) a raw read; validating the name validates the read. Later bindings replace earlier ones, which is right for source order. */
    const groups = new Map<string, Read>();

    const markValidatedByName = (node: EsTreeNode | null | undefined): void => {
      const name = rootName(node);
      const read = name ? groups.get(name) : undefined;
      if (read) read.validated = true;
    };

    /** Marks the read an expression is (or is derived from) as validated. */
    const markValidatedExpression = (node: EsTreeNode | null | undefined): void => {
      if (!node) return;
      const expression = peel(node);
      if (expression.type === "AwaitExpression") return markValidatedExpression(expression.argument);
      if (isRawReaderCall(expression)) {
        const read = reads.find((candidate) => candidate.node === expression);
        if (read) read.validated = true;
        return;
      }
      if (expression.type === "MemberExpression") {
        // `(await readBody(event)).name` and `body.name`
        let root = peel(expression.object);
        while (root.type === "MemberExpression") root = peel(root.object);
        if (root.type === "AwaitExpression" || root.type === "CallExpression") return markValidatedExpression(root);
        return markValidatedByName(root);
      }
      markValidatedByName(expression);
    };

    return {
      CallExpression(node: EsTreeNode) {
        if (isRawReaderCall(node)) {
          const read: Read = { node, validated: false };
          reads.push(read);
          // Climb past transparent wrappers to see how the value is used.
          let child: EsTreeNode = node;
          let parent: EsTreeNode | undefined = node.parent;
          while (parent && TRANSPARENT_PARENTS.has(parent.type)) {
            child = parent;
            parent = parent.parent;
          }
          if (parent?.type === "VariableDeclarator" && parent.init === child) {
            for (const name of boundNames(parent.id)) groups.set(name, read);
          } else if (parent?.type === "AssignmentExpression" && parent.right === child && parent.operator === "=") {
            for (const name of boundNames(parent.left)) groups.set(name, read);
          }
          return;
        }

        if (isValidatingCall(node)) {
          for (const argument of node.arguments as EsTreeNode[]) markValidatedExpression(argument);
        }
        const callee = peel(node.callee);
        if (callee.type === "MemberExpression" && TEST_METHODS.has(calleeName(callee) ?? "")) {
          markValidatedExpression(callee.object);
          markValidatedExpression(node.arguments?.[0]);
        }
      },

      VariableDeclarator(node: EsTreeNode) {
        // `const name = body.name` / `const { page } = query`: the new names stand for the same read.
        const init = node.init ? peel(node.init) : null;
        if (!init || init.type === "CallExpression" || init.type === "AwaitExpression") return;
        const read = init.type === "MemberExpression" || init.type === "Identifier" ? groups.get(rootName(init) ?? "") : undefined;
        if (read) for (const name of boundNames(node.id)) groups.set(name, read);
      },

      BinaryExpression(node: EsTreeNode) {
        if (!COMPARISON_OPERATORS.has(node.operator)) return;
        markValidatedExpression(node.left);
        markValidatedExpression(node.right);
      },

      UnaryExpression(node: EsTreeNode) {
        if (node.operator === "typeof") markValidatedExpression(node.argument);
      },

      "Program:exit"() {
        for (const read of reads) {
          if (read.validated) continue;
          const name = calleeName((read.node as EsTreeNode).callee) ?? "request reader";
          context.report({
            node: read.node,
            message: `${name}() input is used without validation — use getValidatedQuery/readValidatedBody/getValidatedRouterParams with a schema, or run schema.parse() on it`,
          });
        }
      },
    };
  },
});
