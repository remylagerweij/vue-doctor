import { SEQUENTIAL_AWAIT_THRESHOLD } from "../../constants.js";
import { getFilename } from "../../helpers.js";
import { defineRule } from "../../define-rule.js";
import type { EsTreeNode, RuleContext } from "../../types.js";
import { collectPatternNames, getSimpleOperandKey, referencesAnyName, unwrapExpression } from "./helpers.js";

const TEST_FILE_PATTERN = /\.(test|spec|cy)\.(ts|js|vue)$/;

const GUARD_VERBS = new Set(["require", "ensure", "assert", "verify", "check", "guard", "enforce", "authenticate", "authorize", "authorise"]);
const ORDERED_WRITE_VERBS = new Set([
  "insert", "create", "update", "upsert", "delete", "remove", "destroy", "save", "set", "write", "put",
  "post", "patch", "send", "publish", "truncate", "drop", "clear", "reset", "commit", "rollback", "log",
  "record", "migrate", "seed",
]);
// Request-scoped accessors resolve locally; running them in parallel saves nothing.
const REQUEST_ACCESSORS = new Set([
  "readBody", "readValidatedBody", "readRawBody", "readFormData", "readMultipartFormData",
  "getValidatedQuery", "getValidatedRouterParams", "serverSupabaseClient", "serverSupabaseServiceRole",
]);
const MIN_PARALLELISABLE_CALLS = 2;

interface AwaitStep {
  statement: EsTreeNode;
  awaited: EsTreeNode | undefined;
  bound: Set<string>;
  calleeName: string | null;
  receiverKey: string | null;
}

const getCalleeName = (call: EsTreeNode | null | undefined): string | null => {
  if (call?.type !== "CallExpression") return null;
  if (call.callee?.type === "Identifier") return call.callee.name;
  if (call.callee?.type === "MemberExpression" && !call.callee.computed && call.callee.property?.type === "Identifier") {
    return call.callee.property.name;
  }
  return null;
};

const wordsOf = (name: string): string[] => name.split(/(?=[A-Z])/).map((word) => word.toLowerCase());

const isGuardCall = (name: string | null): boolean => {
  if (!name) return false;
  const words = wordsOf(name);
  if (GUARD_VERBS.has(words[0])) return true;
  if (words.at(-1) === "auth") return true;
  return words.some((word, index) => (word === "rate" && words[index + 1] === "limit") || word === "ratelimit");
};

const isOrderedWrite = (name: string | null): boolean => {
  if (!name) return false;
  const words = wordsOf(name);
  return ORDERED_WRITE_VERBS.has(words[0] === "batch" ? (words[1] ?? "") : words[0]);
};

// `storage.getItem(key)` → "storage|key"; two calls on the same receiver and key are ordered.
const getReceiverKey = (call: EsTreeNode | null | undefined): string | null => {
  if (call?.type !== "CallExpression" || call.callee?.type !== "MemberExpression") return null;
  const receiver = getSimpleOperandKey(call.callee.object);
  const key = getSimpleOperandKey(call.arguments?.[0]);
  return receiver !== null && key !== null ? `${receiver}|${key}` : null;
};

const toStep = (statement: EsTreeNode): AwaitStep => {
  const bound = new Set<string>();
  let awaited: EsTreeNode | undefined;
  if (statement.type === "VariableDeclaration") {
    const declarator = statement.declarations[0];
    collectPatternNames(declarator.id, bound);
    awaited = declarator.init?.argument;
  } else {
    awaited = statement.expression?.argument;
  }
  const call = unwrapExpression(awaited);
  return { statement, awaited, bound, calleeName: getCalleeName(call), receiverKey: getReceiverKey(call) };
};

const isIndependent = (segment: AwaitStep[]): boolean => {
  const earlierNames = new Set<string>();
  const earlierReceiverKeys = new Set<string>();
  for (const step of segment) {
    if (referencesAnyName(step.awaited, earlierNames)) return false;
    if (step.receiverKey !== null && earlierReceiverKeys.has(step.receiverKey)) return false;
    for (const name of step.bound) earlierNames.add(name);
    if (step.receiverKey !== null) earlierReceiverKeys.add(step.receiverKey);
  }
  return true;
};

const reportIndependentSegments = (statements: EsTreeNode[], context: RuleContext): void => {
  const steps = statements.map(toStep);
  let segment: AwaitStep[] = [];

  const flushSegment = (): void => {
    const parallelisable = segment.filter((step) => !REQUEST_ACCESSORS.has(step.calleeName ?? "")).length;
    if (segment.length >= SEQUENTIAL_AWAIT_THRESHOLD && parallelisable >= MIN_PARALLELISABLE_CALLS && isIndependent(segment)) {
      context.report({
        node: segment[0].statement,
        message: `${segment.length} sequential await statements that appear independent — use Promise.all() for parallel execution`,
      });
    }
    segment = [];
  };

  steps.forEach((step, index) => {
    const isLast = index === steps.length - 1;
    const isBarrier = isGuardCall(step.calleeName) || (step.bound.size === 0 && !isLast && isOrderedWrite(step.calleeName));
    if (isBarrier) flushSegment();
    else segment.push(step);
  });
  flushSegment();
};

export default defineRule({
  meta: {
    id: "async-parallel",
    category: "Performance",
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    since: "1.0.0",
    help: "Use `const [a, b] = await Promise.all([fetchA(), fetchB()])` to run independent operations concurrently",
    agentGuidance:
      "Independent awaits run one after another. Start them together with `const [a, b] = await Promise.all([fetchA(), fetchB()])`; keep sequential awaits only where a later call needs an earlier result, where an auth, rate-limit or validation guard must finish first, or where writes must land in order.",
  },
  create: (context: RuleContext) => {
    const filename = getFilename(context);
    const isTestFile = TEST_FILE_PATTERN.test(filename);

    return {
      BlockStatement(node: EsTreeNode) {
        if (isTestFile) return;
        const consecutiveAwaitStatements: EsTreeNode[] = [];

        const flushConsecutiveAwaits = (): void => {
          if (consecutiveAwaitStatements.length >= SEQUENTIAL_AWAIT_THRESHOLD) {
            reportIndependentSegments(consecutiveAwaitStatements, context);
          }
          consecutiveAwaitStatements.length = 0;
        };

        for (const statement of node.body ?? []) {
          const isAwaitStatement =
            (statement.type === "VariableDeclaration" &&
              statement.declarations?.length === 1 &&
              statement.declarations[0].init?.type === "AwaitExpression") ||
            (statement.type === "ExpressionStatement" &&
              statement.expression?.type === "AwaitExpression");

          if (isAwaitStatement) {
            consecutiveAwaitStatements.push(statement);
          } else {
            flushConsecutiveAwaits();
          }
        }
        flushConsecutiveAwaits();
      },
    };
  },
});
