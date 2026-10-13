import { defineRule } from "../../define-rule.js";
import { getFilename, walkAst, WALK_SKIP } from "../../helpers.js";
import { AUTH_HELPER_NAME } from "../../server-auth.js";
import { isServerFile } from "../../server-input.js";
import { memberPath, peel } from "../../url-sinks.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

/** `createError` properties a client receives for a handled error. */
const CLIENT_MESSAGE_PROPERTIES: ReadonlySet<string> = new Set(["statusMessage", "message"]);
/** Error details that describe the server (driver messages, SQL, stack traces), not the request. */
const ERROR_DETAIL_PROPERTIES: ReadonlySet<string> = new Set(["message", "stack", "details", "hint"]);
/** `error`, `err`, `planError`: a value named as an error, whatever produced it. */
const ERROR_NAME = /^(?:err|error|\w+Error)$/;
/** h3 readers and helpers that throw a 4xx `createError` themselves. */
const THROWING_READERS = /^(?:readValidatedBody|getValidatedQuery|getValidatedRouterParams?|requireUserSession)$/;
/** What a catch block uses to let an HTTP error through: `isError(e)`, `e.statusCode`, `e instanceof H3Error`. */
const PASSTHROUGH_PROPERTIES: ReadonlySet<string> = new Set(["statusCode", "status"]);

const isFunction = (node: EsTreeNode): boolean =>
  node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";

const calleeName = (callee: EsTreeNode | null | undefined): string | null => {
  if (!callee) return null;
  const node = peel(callee);
  if (node.type === "Identifier") return node.name;
  return node.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier" ? node.property.name : null;
};

const isCreateErrorCall = (node: EsTreeNode): boolean => node.type === "CallExpression" && calleeName(node.callee) === "createError";

const propertyName = (property: EsTreeNode): string | null => {
  if (property.type !== "Property" || property.computed) return null;
  if (property.key?.type === "Identifier") return property.key.name;
  return property.key?.type === "Literal" && typeof property.key.value === "string" ? property.key.value : null;
};

/** The literal status of `createError({ statusCode: 404 })` / `createError({ status: 500 })`, or `null`. */
const literalStatus = (options: EsTreeNode | undefined): number | null => {
  if (options?.type !== "ObjectExpression") return null;
  for (const property of options.properties as EsTreeNode[]) {
    const name = propertyName(property);
    if ((name === "statusCode" || name === "status") && property.value?.type === "Literal" && typeof property.value.value === "number") {
      return property.value.value;
    }
  }
  return null;
};

/** Every node of a subtree, without descending into nested functions. */
const forEachNode = (root: EsTreeNode | null | undefined, visit: (node: EsTreeNode) => void): void => {
  if (!root) return;
  walkAst(root, (node) => {
    if (node !== root && isFunction(node)) return WALK_SKIP;
    visit(node);
  });
};

export default defineRule({
  meta: {
    id: "no-leaky-error-rethrow",
    category: "Server",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["nuxt"],
    cwe: ["CWE-209"],
    owasp: "A04:2021",
    fixable: false,
    since: "2.1.0",
    help: "Do not send a caught error's message to the client, and let HTTP errors through a catch block instead of turning them into a 500",
    agentGuidance:
      "Nitro already turns an unhandled error into a generic 500 and logs its stack, so a handler does not need a try/catch to be safe. When it has one: " +
      "(1) never put `error.message` of a caught error or of a Supabase/Prisma `{ error }` result into `createError({ statusMessage | message })`, because the client receives it and it can name tables, constraints or internal hosts; " +
      "log it with `console.error(\"[Tag] ...\", error)` and throw a fixed, generic `statusMessage`. " +
      "(2) Rethrow HTTP errors before wrapping: `throw isError(error) ? error : createError({ statusCode: 500, statusMessage: \"...\" })` (h3 `isError`), so a 400/401/403/404 thrown in the try block keeps its status.",
  },
  create: (context: RuleContext): RuleVisitors => {
    if (!isServerFile(getFilename(context))) return {};

    /** Caught errors in scope, innermost last. */
    const catchParameters: string[][] = [];
    /** Names destructured from a result's `error` field: `const { data, error } = await client.from(...)`. */
    const resultErrors = new Set<string>();
    const reasonsByCall = new Map<EsTreeNode, string[]>();

    const addReason = (call: EsTreeNode, reason: string): void => {
      const reasons = reasonsByCall.get(call) ?? [];
      if (!reasons.includes(reason)) reasons.push(reason);
      reasonsByCall.set(call, reasons);
    };

    const isErrorName = (name: string): boolean => resultErrors.has(name) || catchParameters.some((names) => names.includes(name));

    /** Whether a client-facing message carries a caught error's details: `e.message`, `` `${err}` ``, `String(error)`, `result.error.message`. */
    const carriesErrorDetails = (value: EsTreeNode): boolean => {
      let leaks = false;
      forEachNode(value, (node) => {
        if (leaks) return;
        if (node.type === "MemberExpression" && !node.computed && ERROR_DETAIL_PROPERTIES.has(node.property?.name)) {
          const path = memberPath(node.object);
          if (path && (isErrorName(path[0]) || ERROR_NAME.test(path[path.length - 1]))) leaks = true;
        } else if (node.type === "TemplateLiteral") {
          leaks = (node.expressions as EsTreeNode[]).some((expression) => {
            const inner = peel(expression);
            return inner.type === "Identifier" && isErrorName(inner.name);
          });
        } else if (node.type === "CallExpression" && calleeName(node.callee) === "String") {
          const argument = node.arguments?.[0] ? peel(node.arguments[0]) : null;
          leaks = argument?.type === "Identifier" && isErrorName(argument.name);
        }
      });
      return leaks;
    };

    /** Whether a try block can throw a 4xx of its own (a `createError` below 500, a guard, a validated reader). */
    const throwsHttpErrors = (block: EsTreeNode): boolean => {
      let found = false;
      walkAst(block, (node) => {
        if (found) return;
        if (node.type !== "CallExpression") return;
        const name = calleeName(node.callee) ?? "";
        if (name === "createError") {
          const status = literalStatus(node.arguments?.[0]);
          found = status === null || status < 500;
        } else if (THROWING_READERS.test(name) || AUTH_HELPER_NAME.test(name)) found = true;
      });
      return found;
    };

    /** Whether a catch block lets HTTP errors through: `isError(e)`, `e.statusCode`, `e instanceof H3Error`, `throw e`. */
    const passesHttpErrorsThrough = (handler: EsTreeNode, parameter: string | null): boolean => {
      let passes = false;
      forEachNode(handler.body, (node) => {
        if (passes) return;
        if (node.type === "CallExpression" && /^is(?:H3)?Error$/.test(calleeName(node.callee) ?? "")) passes = true;
        else if (node.type === "BinaryExpression" && node.operator === "instanceof") passes = true;
        else if (node.type === "MemberExpression" && !node.computed && PASSTHROUGH_PROPERTIES.has(node.property?.name)) {
          passes = parameter === null || memberPath(node.object)?.[0] === parameter;
        } else if (node.type === "ThrowStatement" && parameter !== null) {
          const argument = node.argument ? peel(node.argument) : null;
          passes = argument?.type === "Identifier" && argument.name === parameter;
        }
      });
      return passes;
    };

    return {
      CatchClause(node: EsTreeNode) {
        const parameter = node.param;
        catchParameters.push(parameter?.type === "Identifier" ? [parameter.name] : []);

        const tryStatement = node.parent;
        if (tryStatement?.type !== "TryStatement" || !throwsHttpErrors(tryStatement.block)) return;
        const name = parameter?.type === "Identifier" ? parameter.name : null;
        if (passesHttpErrorsThrough(node, name)) return;
        forEachNode(node.body, (child) => {
          if (child.type !== "ThrowStatement" || !child.argument) return;
          const thrown = peel(child.argument);
          if (isCreateErrorCall(thrown) && literalStatus(thrown.arguments?.[0]) === 500) {
            addReason(thrown, "turns every error from the try block into a 500, including the 4xx errors thrown there — rethrow them first with `if (isError(error)) throw error`");
          }
        });
      },

      "CatchClause:exit"() {
        catchParameters.pop();
      },

      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type !== "ObjectPattern" || !node.init) return;
        for (const property of node.id.properties as EsTreeNode[]) {
          if (propertyName(property) === "error" && property.value?.type === "Identifier") resultErrors.add(property.value.name);
        }
      },

      CallExpression(node: EsTreeNode) {
        if (!isCreateErrorCall(node)) return;
        const options = node.arguments?.[0];
        if (options?.type !== "ObjectExpression") return;
        for (const property of options.properties as EsTreeNode[]) {
          const name = propertyName(property);
          if (name && CLIENT_MESSAGE_PROPERTIES.has(name) && property.value && carriesErrorDetails(property.value)) {
            addReason(node, `sends the error's own message to the client as \`${name}\` — log it and send a fixed message instead`);
          }
        }
      },

      "Program:exit"() {
        for (const [node, reasons] of reasonsByCall) {
          context.report({ node, message: `createError() ${reasons.join("; it also ")}` });
        }
      },
    };
  },
});
