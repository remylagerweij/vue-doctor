import { defineRule } from "../../define-rule.js";
import { getStaticKeyName, walkAst } from "../../helpers.js";
import { collectNames, isSensitiveName } from "../../sensitive-names.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

/** Receivers whose `message` events come from other windows (and carry `event.origin`). Workers and `BroadcastChannel` do not. */
const WINDOW_OBJECTS: ReadonlySet<string> = new Set(["window", "globalThis", "self", "top", "parent"]);
/** Event properties that identify the sender: checking either one before trusting `event.data` counts. */
const SENDER_PROPERTIES: ReadonlySet<string> = new Set(["origin", "source"]);
const FUNCTION_TYPES: ReadonlySet<string> = new Set(["FunctionExpression", "ArrowFunctionExpression", "FunctionDeclaration"]);

const isWindowReceiver = (node: EsTreeNode | undefined): boolean =>
  node?.type === "Identifier" && WINDOW_OBJECTS.has(node.name);

const isMessageEventName = (node: EsTreeNode | undefined): boolean =>
  (node?.type === "Literal" && node.value === "message") ||
  (node?.type === "TemplateLiteral" && node.expressions.length === 0 && node.quasis[0]?.value?.cooked === "message");

/** `handler`, `this.handler`, `handler.bind(this)`: the name of the function a listener refers to. */
const handlerName = (node: EsTreeNode): string | null => {
  let current = node;
  if (current.type === "CallExpression" && current.callee?.type === "MemberExpression" && current.callee.property?.name === "bind") {
    current = current.callee.object;
  }
  if (current.type === "Identifier") return current.name;
  if (current.type === "MemberExpression" && !current.computed && current.object?.type === "ThisExpression" && current.property?.type === "Identifier") {
    return current.property.name;
  }
  return null;
};

type HandlerVerdict = "unchecked" | "checked-or-unknown";

/**
 * Single-function analysis of a message handler. It is `unchecked` only when the handler reads
 * `event.data` and never touches `event.origin` / `event.source`, and the event does not escape to
 * another function (which might do the check).
 */
const analyzeHandler = (handler: EsTreeNode): HandlerVerdict => {
  const parameter: EsTreeNode | undefined = handler.params?.[0];
  if (!parameter || !handler.body) return "checked-or-unknown";

  let readsData = false;
  let checksSender = false;
  let escapes = false;
  const noteProperty = (name: string | null | undefined): void => {
    if (name === "data") readsData = true;
    else if (name && SENDER_PROPERTIES.has(name)) checksSender = true;
  };

  const target = parameter.type === "AssignmentPattern" ? parameter.left : parameter;
  if (target.type === "ObjectPattern") {
    for (const property of target.properties as EsTreeNode[]) {
      if (property.type === "RestElement") escapes = true;
      else noteProperty(getStaticKeyName(property));
    }
  } else if (target.type === "Identifier") {
    const eventName: string = target.name;
    // Identifier nodes that are the object of a member access or a destructuring source, not an escape.
    const consumed = new WeakSet<EsTreeNode>();
    walkAst(handler.body, (node) => {
      if (node.type === "MemberExpression" && node.object?.type === "Identifier" && node.object.name === eventName) {
        consumed.add(node.object);
        noteProperty(node.computed ? (node.property?.type === "Literal" ? String(node.property.value) : null) : node.property?.name);
        if (node.computed && node.property?.type !== "Literal") escapes = true;
      } else if (node.type === "VariableDeclarator" && node.init?.type === "Identifier" && node.init.name === eventName) {
        // `const { data, origin } = event`
        consumed.add(node.init);
        if (node.id?.type === "ObjectPattern") {
          for (const property of node.id.properties as EsTreeNode[]) {
            if (property.type === "RestElement") escapes = true;
            else noteProperty(getStaticKeyName(property));
          }
        } else {
          escapes = true;
        }
      } else if (node.type === "Identifier" && node.name === eventName && !consumed.has(node)) {
        escapes = true;
      }
    });
  } else {
    return "checked-or-unknown";
  }

  return readsData && !checksSender && !escapes ? "unchecked" : "checked-or-unknown";
};

export default defineRule({
  meta: {
    id: "postmessage-origin-check",
    category: "Security",
    // Warning, medium confidence: the check can live in a helper the single-function analysis cannot
    // see, and a `postMessage(x, "*")` is only a problem when `x` is sensitive.
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-346"],
    owasp: "A01:2021",
    fixable: false,
    since: "2.0.0",
    help: "Check `event.origin` against an allowlist before using `event.data`, and pass an explicit target origin to `postMessage`",
    agentGuidance:
      "In every `message` listener, verify the sender first: `if (event.origin !== \"https://trusted.example\") return;` (compare against an exact origin or an allowlist, never `includes`/`startsWith`) " +
      "before reading `event.data`; checking `event.source === iframe.contentWindow` also counts. When sending, pass the receiver's exact origin as the second argument of `postMessage`, " +
      "never `\"*\"` for tokens, sessions or personal data.",
  },
  create: (context: RuleContext) => {
    const functionsByName = new Map<string, EsTreeNode>();
    const listeners: { node: EsTreeNode; handler: EsTreeNode | string }[] = [];

    const addFunction = (name: string | null, fn: EsTreeNode | null | undefined): void => {
      if (name && fn && FUNCTION_TYPES.has(fn.type) && !functionsByName.has(name)) functionsByName.set(name, fn);
    };

    const addListener = (node: EsTreeNode, handlerNode: EsTreeNode | undefined): void => {
      if (!handlerNode) return;
      if (FUNCTION_TYPES.has(handlerNode.type)) return void listeners.push({ node, handler: handlerNode });
      const name = handlerName(handlerNode);
      if (name) listeners.push({ node, handler: name });
    };

    return {
      FunctionDeclaration(node: EsTreeNode) {
        addFunction(node.id?.name ?? null, node);
      },
      VariableDeclarator(node: EsTreeNode) {
        if (node.id?.type === "Identifier") addFunction(node.id.name, node.init);
      },
      // Options API methods and `{ handler() {} }` members, class methods.
      Property(node: EsTreeNode) {
        addFunction(getStaticKeyName(node), node.value);
      },
      MethodDefinition(node: EsTreeNode) {
        addFunction(getStaticKeyName(node), node.value);
      },

      CallExpression(node: EsTreeNode) {
        const callee: EsTreeNode = node.callee;
        const args = node.arguments as EsTreeNode[];

        // `window.addEventListener("message", h)` / bare `addEventListener("message", h)`
        const isWindowListener =
          (callee.type === "Identifier" && callee.name === "addEventListener") ||
          (callee.type === "MemberExpression" && !callee.computed && callee.property?.name === "addEventListener" && isWindowReceiver(callee.object));
        if (isWindowListener && isMessageEventName(args[0])) return addListener(node, args[1]);

        // VueUse: `useEventListener("message", h)` / `useEventListener(window, "message", h)`
        if (callee.type === "Identifier" && callee.name === "useEventListener") {
          if (isMessageEventName(args[0])) return addListener(node, args[1]);
          if (isWindowReceiver(args[0]) && isMessageEventName(args[1])) return addListener(node, args[2]);
        }

        // `window.postMessage(data, "*")`: any page can read the message.
        const isPostMessage = callee.type === "MemberExpression" && !callee.computed && callee.property?.name === "postMessage";
        if (!isPostMessage || !args[0]) return;
        const target = args[1];
        const wildcard =
          (target?.type === "Literal" && target.value === "*") ||
          (target?.type === "ObjectExpression" &&
            (target.properties as EsTreeNode[]).some(
              (property) => property.type === "Property" && getStaticKeyName(property) === "targetOrigin" && property.value?.type === "Literal" && property.value.value === "*",
            ));
        if (wildcard && collectNames(args[0], { literals: false }).some(isSensitiveName)) {
          context.report({
            node,
            message: 'postMessage() sends sensitive-looking data to targetOrigin "*" — pass the receiver\'s exact origin so other windows cannot read it',
          });
        }
      },

      // `window.onmessage = h`
      AssignmentExpression(node: EsTreeNode) {
        const left: EsTreeNode = node.left;
        if (
          node.operator === "=" &&
          left.type === "MemberExpression" &&
          !left.computed &&
          left.property?.name === "onmessage" &&
          isWindowReceiver(left.object)
        ) {
          addListener(node, node.right);
        }
      },

      "Program:exit"() {
        for (const { node, handler } of listeners) {
          const fn = typeof handler === "string" ? functionsByName.get(handler) : handler;
          if (fn && analyzeHandler(fn) === "unchecked") {
            context.report({
              node,
              message:
                "`message` handler reads `event.data` without checking `event.origin` — any page that can open or embed this one can send it messages; compare `event.origin` to an allowlist first",
            });
          }
        }
      },
    };
  },
});
