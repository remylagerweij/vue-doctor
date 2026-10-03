// Child keys per ESTree node type, in source order. Lets the AST walker read only the
// properties that can hold child nodes instead of calling Object.keys() on every node.
// Types missing from this table (JSX, most TS-only nodes, future syntax) fall back to a
// generic key scan in the walker, so coverage gaps cost speed, never correctness.
// Type-annotation-only children (`typeAnnotation`, `returnType`, `typeParameters`) are
// deliberately not listed: no rule looks for executable code inside type positions.
const NONE: readonly string[] = [];

const WRAPPER_TYPES = [
  "ExpressionStatement",
  "ChainExpression",
  "ParenthesizedExpression",
  "TSNonNullExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
] as const;

const ARGUMENT_TYPES = [
  "ReturnStatement",
  "ThrowStatement",
  "UnaryExpression",
  "UpdateExpression",
  "AwaitExpression",
  "YieldExpression",
  "SpreadElement",
  "RestElement",
] as const;

const LEFT_RIGHT_TYPES = [
  "BinaryExpression",
  "LogicalExpression",
  "AssignmentExpression",
  "AssignmentPattern",
] as const;

const LEAF_TYPES = [
  "Identifier",
  "PrivateIdentifier",
  "Literal",
  "TemplateElement",
  "ThisExpression",
  "Super",
  "EmptyStatement",
  "DebuggerStatement",
] as const;

export const VISITOR_KEYS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(LEAF_TYPES.map((type) => [type, NONE])),
  ...Object.fromEntries(WRAPPER_TYPES.map((type) => [type, ["expression"]])),
  ...Object.fromEntries(ARGUMENT_TYPES.map((type) => [type, ["argument"]])),
  ...Object.fromEntries(LEFT_RIGHT_TYPES.map((type) => [type, ["left", "right"]])),
  Program: ["body"],
  BlockStatement: ["body"],
  StaticBlock: ["body"],
  ClassBody: ["body"],
  WithStatement: ["object", "body"],
  LabeledStatement: ["label", "body"],
  BreakStatement: ["label"],
  ContinueStatement: ["label"],
  IfStatement: ["test", "consequent", "alternate"],
  ConditionalExpression: ["test", "consequent", "alternate"],
  SwitchStatement: ["discriminant", "cases"],
  SwitchCase: ["test", "consequent"],
  TryStatement: ["block", "handler", "finalizer"],
  CatchClause: ["param", "body"],
  WhileStatement: ["test", "body"],
  DoWhileStatement: ["body", "test"],
  ForStatement: ["init", "test", "update", "body"],
  ForInStatement: ["left", "right", "body"],
  ForOfStatement: ["left", "right", "body"],
  FunctionDeclaration: ["id", "params", "body"],
  FunctionExpression: ["id", "params", "body"],
  ArrowFunctionExpression: ["params", "body"],
  VariableDeclaration: ["declarations"],
  VariableDeclarator: ["id", "init"],
  ArrayExpression: ["elements"],
  ArrayPattern: ["elements"],
  ObjectExpression: ["properties"],
  ObjectPattern: ["properties"],
  Property: ["key", "value"],
  CallExpression: ["callee", "arguments"],
  NewExpression: ["callee", "arguments"],
  MemberExpression: ["object", "property"],
  SequenceExpression: ["expressions"],
  TemplateLiteral: ["quasis", "expressions"],
  TaggedTemplateExpression: ["tag", "quasi"],
  ClassDeclaration: ["id", "superClass", "body"],
  ClassExpression: ["id", "superClass", "body"],
  MethodDefinition: ["key", "value"],
  PropertyDefinition: ["key", "value"],
  MetaProperty: ["meta", "property"],
  ImportExpression: ["source"],
};
