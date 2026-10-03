import { defineRule } from "../../define-rule.js";
import { createRequestInputTracker, peel } from "../../request-input.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

/** Methods that run a SQL string: `db.query(sql)`, `pool.execute(sql)`, `knex.raw(sql)`, `sequelize.query(sql)`. */
const SQL_METHODS: ReadonlySet<string> = new Set(["query", "execute", "raw", "unsafe", "all", "run", "get", "prepare"]);
/** Prisma's escape hatches that take a plain string; their names say they are unsafe. */
const UNSAFE_SQL_METHODS: ReadonlySet<string> = new Set(["$queryRawUnsafe", "$executeRawUnsafe"]);

/** Enough SQL shape to tell a statement from prose: a verb with its second keyword. */
const SQL_STATEMENT = /\b(?:select\b[\s\S]+\bfrom|insert\s+into|update\b[\s\S]+\bset\b|delete\s+from|drop\s+(?:table|database)|alter\s+table|truncate\s+table)\b/i;

const CHILD_PROCESS_MODULES: ReadonlySet<string> = new Set(["child_process", "node:child_process"]);
/** `exec`-like functions always run a shell. */
const SHELL_FUNCTIONS: ReadonlySet<string> = new Set(["exec", "execSync"]);
/** `spawn`-like functions run a shell only with the `shell` option. */
const SPAWN_FUNCTIONS: ReadonlySet<string> = new Set(["spawn", "spawnSync", "execFile", "execFileSync"]);

/** An interpolation that cannot carry attacker input: a CONSTANT, or the placeholder list of a prepared statement. */
const isBenignInterpolation = (node: EsTreeNode): boolean => {
  const expression = peel(node);
  if (expression.type === "Literal") return true;
  if (expression.type === "Identifier") return /^[A-Z][A-Z0-9_]*$/.test(expression.name) || /^placeholders?$/i.test(expression.name);
  return false;
};

/** The static text of a string expression, with `?` standing in for each dynamic part; `dynamic` says whether there were any. */
const describeString = (node: EsTreeNode | undefined): { text: string; dynamic: EsTreeNode[] } => {
  const dynamic: EsTreeNode[] = [];
  const visit = (current: EsTreeNode): string => {
    const expression = peel(current);
    if (expression.type === "Literal") return typeof expression.value === "string" ? expression.value : "?";
    if (expression.type === "TemplateLiteral") {
      const parts = (expression.quasis as EsTreeNode[]).map((quasi) => quasi.value?.cooked ?? "");
      const values = expression.expressions as EsTreeNode[];
      return parts.map((part, index) => (index < values.length ? `${part}${visitDynamic(values[index])}` : part)).join("");
    }
    if (expression.type === "BinaryExpression" && expression.operator === "+") return `${visit(expression.left)}${visit(expression.right)}`;
    return visitDynamic(expression);
  };
  const visitDynamic = (current: EsTreeNode): string => {
    const expression = peel(current);
    if (expression.type === "Literal" || expression.type === "TemplateLiteral" || (expression.type === "BinaryExpression" && expression.operator === "+")) {
      return visit(expression);
    }
    if (!isBenignInterpolation(expression)) dynamic.push(expression);
    return "?";
  };
  return node ? { text: visit(node), dynamic } : { text: "", dynamic };
};

const propertyName = (member: EsTreeNode): string | null => {
  if (member.type !== "MemberExpression") return null;
  if (!member.computed) return member.property?.type === "Identifier" ? member.property.name : null;
  return member.property?.type === "Literal" && typeof member.property.value === "string" ? member.property.value : null;
};

/** Whether the options object has `shell` set to something other than a literal `false`. */
const hasShellOption = (options: EsTreeNode | undefined): boolean => {
  if (options?.type !== "ObjectExpression") return false;
  return (options.properties as EsTreeNode[]).some(
    (property) =>
      property.type === "Property" &&
      !property.computed &&
      (property.key?.name === "shell" || property.key?.value === "shell") &&
      !(property.value?.type === "Literal" && property.value.value === false),
  );
};

export default defineRule({
  meta: {
    id: "no-injection",
    category: "Security",
    // Warning, medium confidence: an interpolated query or command is dangerous only when the value
    // is attacker-controlled, which a single file cannot prove (it may be an enum, an id, a constant).
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-89", "CWE-78"],
    owasp: "A03:2021",
    fixable: false,
    since: "2.0.0",
    help: "Pass values as query parameters (`?` / `$1`) or a tagged `sql` template, and run commands with `execFile`/`spawn` and an argument array, never through a shell string",
    agentGuidance:
      "SQL: do not build the statement with a template literal or `+` around request data. Use placeholders and pass the values separately " +
      "(`db.query('SELECT * FROM users WHERE id = $1', [id])`, `pool.execute('... WHERE id = ?', [id])`), the tagged template of your client " +
      "(Prisma `$queryRaw`\\`...\\``, Drizzle `sql\\`...\\``, `postgres` sql\\`...\\``), or the query builder. Identifiers (table or column names) cannot be bound: pick them from a fixed allowlist. " +
      "Commands: replace `exec(\\`cmd ${x}\\`)` / `execSync` with `execFile('cmd', [x])` or `spawn('cmd', [x])` and do not set `shell: true`; validate the argument (allowlist or strict schema) as well. " +
      "If the interpolated value is a constant or an allowlisted identifier, say so in a comment and suppress this finding with `vue-doctor-disable-next-line`.",
  },
  create: (context: RuleContext): RuleVisitors => {
    const input = createRequestInputTracker();
    // Local names bound to child_process functions (`import { exec as run } from "child_process"` gives run -> exec),
    // and namespaces (`import cp from "node:child_process"`, `const cp = require("child_process")`).
    const processFunctions = new Map<string, string>();
    const processNamespaces = new Set<string>();

    const describeValue = (node: EsTreeNode): string => (input.isInput(node) ? "request input" : "an interpolated value");

    const reportCommand = (node: EsTreeNode, name: string, command: EsTreeNode | undefined, shell: boolean): void => {
      if (!command || !shell) return;
      const { dynamic } = describeString(command);
      const tainted = input.isInput(command);
      if (dynamic.length === 0 && !tainted) return;
      context.report({
        node,
        message: `\`${name}\` runs a shell command that contains ${tainted || dynamic.some((part) => input.isInput(part)) ? "request input" : "an interpolated value"} — a shell metacharacter in it runs arbitrary commands (command injection); use \`execFile\`/\`spawn\` with an argument array`,
      });
    };

    const reportSql = (node: EsTreeNode, method: string, query: EsTreeNode | undefined, unsafeMethod: boolean): void => {
      if (!query) return;
      const { text, dynamic } = describeString(query);
      const tainted = input.isInput(query);
      if (dynamic.length === 0 && !(tainted && query.type === "Identifier" && unsafeMethod)) return;
      if (!unsafeMethod && !SQL_STATEMENT.test(text)) return;
      context.report({
        node,
        message: `\`${method}()\` receives a SQL string built with ${dynamic.length > 0 ? describeValue(dynamic[0]) : "request input"} — SQL injection; pass values as bound parameters or use a tagged \`sql\` template`,
      });
    };

    return {
      ImportDeclaration(node: EsTreeNode) {
        if (!CHILD_PROCESS_MODULES.has(node.source?.value)) return;
        for (const specifier of node.specifiers as EsTreeNode[]) {
          if (specifier.type === "ImportSpecifier") processFunctions.set(specifier.local.name, specifier.imported?.name ?? specifier.imported?.value);
          else processNamespaces.add(specifier.local.name);
        }
      },

      VariableDeclarator(node: EsTreeNode) {
        input.recordDeclarator(node);
        // `const cp = require("child_process")` / `const { exec } = require("node:child_process")`
        const init = node.init ? peel(node.init) : undefined;
        if (
          init?.type === "CallExpression" &&
          init.callee?.type === "Identifier" &&
          init.callee.name === "require" &&
          init.arguments?.[0]?.type === "Literal" &&
          CHILD_PROCESS_MODULES.has(init.arguments[0].value)
        ) {
          if (node.id?.type === "Identifier") processNamespaces.add(node.id.name);
          if (node.id?.type === "ObjectPattern") {
            for (const property of node.id.properties as EsTreeNode[]) {
              if (property.type === "Property" && property.key?.type === "Identifier" && property.value?.type === "Identifier") {
                processFunctions.set(property.value.name, property.key.name);
              }
            }
          }
        }
      },

      AssignmentExpression(node: EsTreeNode) {
        input.recordAssignment(node);
      },

      CallExpression(node: EsTreeNode) {
        const callee = peel(node.callee);
        const [first, second, third] = node.arguments as EsTreeNode[];

        // child_process: `exec(cmd)`, `cp.execSync(cmd)`, `spawn(cmd, args, { shell: true })`
        let processFunction: string | undefined;
        if (callee.type === "Identifier") processFunction = processFunctions.get(callee.name);
        else if (callee.type === "MemberExpression" && callee.object?.type === "Identifier" && processNamespaces.has(callee.object.name)) {
          processFunction = propertyName(callee) ?? undefined;
        }
        if (processFunction) {
          if (SHELL_FUNCTIONS.has(processFunction)) reportCommand(node, processFunction, first, true);
          else if (SPAWN_FUNCTIONS.has(processFunction)) {
            // `spawn(cmd, { shell })` or `spawn(cmd, args, { shell })`
            const options = second?.type === "ObjectExpression" ? second : third;
            reportCommand(node, processFunction, first, hasShellOption(options));
          }
          return;
        }

        // SQL strings passed to a query method.
        if (callee.type !== "MemberExpression") return;
        const method = propertyName(callee);
        if (!method) return;
        if (UNSAFE_SQL_METHODS.has(method)) return reportSql(node, method, first, true);
        if (SQL_METHODS.has(method)) reportSql(node, method, first, false);
      },
    };
  },
});
