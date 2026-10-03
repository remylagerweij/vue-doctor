import { describe, expect, it } from "vitest";
import {
  analyzeWatchCallback,
  createLoopAwareVisitors,
  findEnclosingFunction,
  getCallbackStatements,
  getStaticKeyName,
  getWatchCallback,
  getWatchEffectCallback,
  isFunctionNode,
  isSetupFunction,
  isSpecificCall,
  isUppercaseName,
  walkAst,
  WALK_SKIP,
  WALK_STOP,
} from "../src/plugin/helpers.js";
import type { EsTreeNode } from "../src/plugin/types.js";

// Hand-built ESTree fragments: these helpers normally run inside oxlint, where coverage tooling
// cannot see them, so their branches are exercised here directly.
const id = (name: string): EsTreeNode => ({ type: "Identifier", name });
const call = (callee: EsTreeNode, args: EsTreeNode[] = []): EsTreeNode => ({ type: "CallExpression", callee, arguments: args });
const statement = (expression: EsTreeNode): EsTreeNode => ({ type: "ExpressionStatement", expression });
const arrow = (body: EsTreeNode): EsTreeNode => ({ type: "ArrowFunctionExpression", body, params: [] });
const block = (...body: EsTreeNode[]): EsTreeNode => ({ type: "BlockStatement", body });
const member = (object: string, property: string): EsTreeNode => ({
  type: "MemberExpression",
  object: id(object),
  property: id(property),
});
const assignValue = (name: string): EsTreeNode => ({
  type: "AssignmentExpression",
  left: member(name, "value"),
  right: { type: "Literal", value: 1 },
});

describe("walkAst", () => {
  const tree = (): EsTreeNode => ({
    type: "Program",
    body: [statement(call(id("a"))), statement(call(id("b")))],
  });

  it("visits nodes depth first, through arrays and single children, and ignores parent links", () => {
    const root = tree();
    (root.body[0] as EsTreeNode).parent = root;
    const seen: string[] = [];
    walkAst(root, (node) => {
      seen.push(node.type + (node.name ? `:${node.name}` : ""));
    });
    expect(seen).toEqual([
      "Program",
      "ExpressionStatement",
      "CallExpression",
      "Identifier:a",
      "ExpressionStatement",
      "CallExpression",
      "Identifier:b",
    ]);
  });

  it("does not descend into a node when the visitor returns WALK_SKIP", () => {
    const seen: string[] = [];
    walkAst(tree(), (node) => {
      seen.push(node.type);
      if (node.type === "CallExpression") return WALK_SKIP;
    });
    expect(seen.filter((type) => type === "Identifier")).toEqual([]);
    expect(seen.filter((type) => type === "CallExpression")).toHaveLength(2);
  });

  it("aborts the whole walk when the visitor returns WALK_STOP", () => {
    const seen: string[] = [];
    walkAst(tree(), (node) => {
      seen.push(node.type);
      if (node.type === "Identifier") return WALK_STOP;
    });
    expect(seen).toEqual(["Program", "ExpressionStatement", "CallExpression", "Identifier"]);
  });

  it("scans every own key of node types it does not know and tolerates non-node input", () => {
    const seen: string[] = [];
    walkAst({ type: "FutureSyntax", payload: id("x"), list: [id("y"), null, 3] }, (node) => {
      seen.push(node.type);
    });
    expect(seen).toEqual(["FutureSyntax", "Identifier", "Identifier"]);
    expect(() => walkAst(null as unknown as EsTreeNode, () => {})).not.toThrow();
  });
});

describe("call and name helpers", () => {
  it("matches calls by identifier name or set of names", () => {
    expect(isSpecificCall(call(id("watch")), "watch")).toBe(true);
    expect(isSpecificCall(call(id("watch")), new Set(["watch", "watchEffect"]))).toBe(true);
    expect(isSpecificCall(call(id("other")), "watch")).toBe(false);
    expect(isSpecificCall(call(member("a", "watch")), "watch")).toBe(false);
    expect(isSpecificCall(id("watch"), "watch")).toBe(false);
  });

  it("recognises UPPER_CASE names", () => {
    expect(isUppercaseName("API_URL")).toBe(true);
    expect(isUppercaseName("apiUrl")).toBe(false);
  });

  it("returns static key names of properties and rejects computed or dynamic keys", () => {
    expect(getStaticKeyName({ type: "Property", key: id("setup") })).toBe("setup");
    expect(getStaticKeyName({ type: "Property", key: { type: "Literal", value: "setup" } })).toBe("setup");
    expect(getStaticKeyName({ type: "Property", key: { type: "Literal", value: 1 } })).toBeNull();
    expect(getStaticKeyName({ type: "Property", key: id("setup"), computed: true })).toBeNull();
    expect(getStaticKeyName({ type: "Property", key: call(id("f")) })).toBeNull();
  });
});

describe("watch callbacks", () => {
  it("returns the second argument of watch() and the first of watchEffect() only when they are functions", () => {
    const callback = arrow(block());
    const fnExpression: EsTreeNode = { type: "FunctionExpression", body: block() };
    expect(getWatchCallback(call(id("watch"), [id("source"), callback]))).toBe(callback);
    expect(getWatchCallback(call(id("watch"), [id("source"), fnExpression]))).toBe(fnExpression);
    expect(getWatchCallback(call(id("watch"), [id("source")]))).toBeNull();
    expect(getWatchCallback(call(id("watch"), [id("source"), id("handler")]))).toBeNull();
    expect(getWatchCallback(call(id("watch")))).toBeNull();

    expect(getWatchEffectCallback(call(id("watchEffect"), [callback]))).toBe(callback);
    expect(getWatchEffectCallback(call(id("watchEffect"), [fnExpression]))).toBe(fnExpression);
    expect(getWatchEffectCallback(call(id("watchEffect"), [id("handler")]))).toBeNull();
    expect(getWatchEffectCallback(call(id("watchEffect")))).toBeNull();
  });

  it("lists the statements of block bodies and wraps expression bodies", () => {
    const first = statement(call(id("a")));
    expect(getCallbackStatements(arrow(block(first)))).toEqual([first]);
    expect(getCallbackStatements({ type: "ArrowFunctionExpression", body: { type: "BlockStatement" } })).toEqual([]);
    const expression = call(id("a"));
    expect(getCallbackStatements(arrow(expression))).toEqual([expression]);
    expect(getCallbackStatements({ type: "ArrowFunctionExpression" })).toEqual([]);
  });

  it("detects fetch calls (identifier and member callees) and counts .value assignments and setter calls", () => {
    const analysis = analyzeWatchCallback(
      arrow(
        block(
          statement(assignValue("a")),
          statement(assignValue("b")),
          statement(call(id("setName"), [])),
          statement(call(id("notASetter"))),
          statement(call(member("axios", "get"))),
          statement({ type: "AssignmentExpression", left: member("a", "other") }),
          { type: "ExpressionStatement" },
        ),
      ),
    );
    expect(analysis).toEqual({ hasFetchCall: true, mutationCount: 3 });
  });

  it("reports no fetch for ordinary calls and memoizes the analysis per callback node", () => {
    const callback = arrow(block(statement(call(member("console", "log")))));
    const first = analyzeWatchCallback(callback);
    expect(first).toEqual({ hasFetchCall: false, mutationCount: 0 });
    expect(analyzeWatchCallback(callback)).toBe(first);
  });
});

describe("function helpers", () => {
  it("identifies function nodes", () => {
    expect(isFunctionNode(arrow(block()))).toBe(true);
    expect(isFunctionNode({ type: "FunctionDeclaration" })).toBe(true);
    expect(isFunctionNode(id("x"))).toBe(false);
    expect(isFunctionNode(null)).toBe(false);
    expect(isFunctionNode(undefined)).toBe(false);
  });

  it("recognises the Options API setup() hook in its three spellings, but not other functions", () => {
    const setupFunction = (ownerType: string, key: EsTreeNode, valueType = "FunctionExpression"): EsTreeNode => {
      const fn: EsTreeNode = { type: valueType, body: block() };
      fn.parent = { type: ownerType, key, value: fn };
      return fn;
    };
    expect(isSetupFunction(setupFunction("Property", id("setup")))).toBe(true);
    expect(isSetupFunction(setupFunction("MethodDefinition", id("setup")))).toBe(true);
    expect(isSetupFunction(setupFunction("Property", id("setup"), "ArrowFunctionExpression"))).toBe(true);
    expect(isSetupFunction(setupFunction("Property", id("mounted")))).toBe(false);
    expect(isSetupFunction(setupFunction("Property", id("setup"), "FunctionDeclaration"))).toBe(false);
    expect(isSetupFunction({ type: "FunctionExpression", parent: { type: "CallExpression" } })).toBe(false);
    expect(isSetupFunction({ type: "FunctionExpression" })).toBe(false);
    expect(isSetupFunction(id("setup"))).toBe(false);
    expect(isSetupFunction(null)).toBe(false);
  });

  it("finds the nearest enclosing function, optionally skipping arrow functions", () => {
    const outer: EsTreeNode = { type: "FunctionDeclaration" };
    const inner: EsTreeNode = { type: "ArrowFunctionExpression", parent: outer };
    const leaf: EsTreeNode = { type: "Identifier", parent: { type: "ExpressionStatement", parent: inner } };
    expect(findEnclosingFunction(leaf)).toBe(inner);
    expect(findEnclosingFunction(leaf, { skipArrows: true })).toBe(outer);
    expect(findEnclosingFunction({ type: "Identifier" })).toBeNull();
    expect(findEnclosingFunction({ type: "Identifier", parent: inner }, { skipArrows: true })).toBe(outer);
  });
});

describe("createLoopAwareVisitors", () => {
  it("runs inner handlers only while inside a loop, including nested loops", () => {
    const hits: string[] = [];
    const visitors = createLoopAwareVisitors({ CallExpression: (node) => hits.push(node.name) });
    const enter = (type: string) => (visitors[type] as (node?: EsTreeNode) => void)();
    const exit = (type: string) => (visitors[`${type}:exit`] as (node?: EsTreeNode) => void)();
    const callNode = (name: string) => (visitors.CallExpression as (node: EsTreeNode) => void)({ type: "CallExpression", name });

    callNode("outside");
    enter("ForStatement");
    enter("WhileStatement");
    callNode("inner");
    exit("WhileStatement");
    callNode("stillInLoop");
    exit("ForStatement");
    callNode("after");

    expect(hits).toEqual(["inner", "stillInLoop"]);
  });
});
