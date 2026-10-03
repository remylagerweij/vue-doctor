import { defineRule } from "../../define-rule.js";
import { getStaticKeyName, walkAst } from "../../helpers.js";
import { collectNames, isSensitiveName } from "../../sensitive-names.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const STORAGE_OBJECTS: ReadonlySet<string> = new Set(["localStorage", "sessionStorage"]);
const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(["window", "globalThis", "self"]);
/** VueUse composables that always persist to web storage under their first argument's key. */
const STORAGE_COMPOSABLES: ReadonlySet<string> = new Set(["useLocalStorage", "useSessionStorage"]);
const REACTIVE_FACTORIES: ReadonlySet<string> = new Set(["ref", "shallowRef", "reactive", "shallowReactive", "computed"]);

/** `localStorage`, `window.localStorage`, `globalThis.sessionStorage`. */
const isWebStorage = (node: EsTreeNode | undefined): boolean => {
  if (!node) return false;
  if (node.type === "Identifier") return STORAGE_OBJECTS.has(node.name);
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    STORAGE_OBJECTS.has(node.property?.name ?? "") &&
    node.object?.type === "Identifier" &&
    GLOBAL_OBJECTS.has(node.object.name)
  );
};

/** A value that is fixed text (`"true"`, `` `1` ``): it cannot be a credential read from a response. */
const isStaticValue = (node: EsTreeNode | undefined): boolean =>
  !node || node.type === "Literal" || (node.type === "TemplateLiteral" && node.expressions.length === 0);

const isSensitiveKey = (key: EsTreeNode | undefined): boolean => collectNames(key).some(isSensitiveName);
const isSensitiveValue = (value: EsTreeNode | undefined): boolean =>
  !isStaticValue(value) && collectNames(value, { literals: false }).some(isSensitiveName);

const STORAGE_MESSAGE =
  "web storage is readable by any script on the page, so one XSS (or a compromised dependency) steals the credential; keep session tokens in an httpOnly, Secure, SameSite cookie set by the server";

const stringLiterals = (node: EsTreeNode | undefined): string[] =>
  node?.type === "ArrayExpression"
    ? (node.elements as EsTreeNode[]).flatMap((element) =>
        element?.type === "Literal" && typeof element.value === "string" ? [element.value] : [],
      )
    : [];

/** The object a store's `state` option returns (`state: () => ({ token: null })`, `state() { return {...} }`). */
const stateKeys = (stateProperty: EsTreeNode | undefined): string[] => {
  const getter = stateProperty?.value ?? null;
  if (!getter) return [];
  let object: EsTreeNode | undefined = getter.type === "ObjectExpression" ? getter : undefined;
  if (getter.type === "ArrowFunctionExpression" && getter.body?.type === "ObjectExpression") object = getter.body;
  if (!object && getter.body?.type === "BlockStatement") {
    walkAst(getter.body, (node) => {
      if (!object && node.type === "ReturnStatement" && node.argument?.type === "ObjectExpression") object = node.argument;
    });
  }
  return (object?.properties ?? []).flatMap((property: EsTreeNode) => {
    const name = property.type === "Property" ? getStaticKeyName(property) : null;
    return name ? [name] : [];
  });
};

/** Names a setup store keeps in refs (`const token = ref("")`). */
const setupStoreNames = (setup: EsTreeNode | undefined): string[] => {
  if (!setup || (setup.type !== "ArrowFunctionExpression" && setup.type !== "FunctionExpression") || setup.body?.type !== "BlockStatement") return [];
  const names: string[] = [];
  for (const statement of setup.body.body as EsTreeNode[]) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declarator of statement.declarations as EsTreeNode[]) {
      const init = declarator.init;
      if (
        declarator.id?.type === "Identifier" &&
        init?.type === "CallExpression" &&
        init.callee?.type === "Identifier" &&
        REACTIVE_FACTORIES.has(init.callee.name)
      ) {
        names.push(declarator.id.name);
      }
    }
  }
  return names;
};

export default defineRule({
  meta: {
    id: "no-token-in-web-storage",
    category: "Security",
    // Warning, medium confidence: name-based. Storing a token in web storage is a deliberate (if
    // risky) trade-off in many SPAs, and a "token" key can also hold something harmless.
    defaultSeverity: "warning",
    confidence: "medium",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-922"],
    owasp: "A04:2021",
    fixable: false,
    since: "2.0.0",
    help: "Keep tokens out of localStorage/sessionStorage: use an httpOnly, Secure, SameSite cookie set by the server, or keep the token in memory",
    agentGuidance:
      "Do not persist access/refresh tokens, JWTs or session ids in `localStorage`/`sessionStorage` (including `useLocalStorage`, `useStorage` and Pinia `persist`). " +
      "Have the server set the session as an `httpOnly; Secure; SameSite=Lax` cookie and send requests with `credentials: \"include\"`; " +
      "if a token must be handled in the browser, keep it in memory (a Pinia store without `persist`, or a module variable) and use short-lived tokens. " +
      "In Pinia persistence, exclude credentials with `persist: { pick: [\"theme\"] }`. CSRF tokens are not reported.",
  },
  create: (context: RuleContext) => {
    const report = (node: EsTreeNode, what: string): void => {
      context.report({ node, message: `${what} stores a credential in web storage — ${STORAGE_MESSAGE}` });
    };

    /** Reports a Pinia `persist` option when it would write credentials to web storage. */
    const checkPersist = (persist: EsTreeNode, storeId: string | null, stateNames: string[]): void => {
      const config = persist.value;
      if (!config || (config.type === "Literal" && config.value === false)) return;
      let options: EsTreeNode[] = [];
      if (config.type === "ObjectExpression") options = [config];
      else if (config.type === "ArrayExpression") options = (config.elements as EsTreeNode[]).filter((element) => element?.type === "ObjectExpression");

      // Cookie / custom storage (`storage: piniaPluginPersistedstate.cookies()`) is not web storage.
      const usesWebStorage = (option: EsTreeNode): boolean => {
        const storage = (option.properties as EsTreeNode[]).find((property) => property.type === "Property" && getStaticKeyName(property) === "storage");
        return !storage || collectNames(storage.value, { literals: false }).some((name) => STORAGE_OBJECTS.has(name));
      };
      const webOptions = options.length === 0 ? [null] : options.filter(usesWebStorage);

      for (const option of webOptions) {
        const picked = option?.properties.find(
          (property: EsTreeNode) => property.type === "Property" && ["paths", "pick"].includes(getStaticKeyName(property) ?? ""),
        );
        const persistedNames = picked ? stringLiterals(picked.value) : [storeId ?? "", ...stateNames];
        if (persistedNames.some(isSensitiveName)) {
          report(persist, `Pinia \`persist\` of ${storeId ? `store "${storeId}"` : "a store"}`);
          return;
        }
      }
    };

    return {
      CallExpression(node: EsTreeNode) {
        const callee: EsTreeNode = node.callee;
        const args = node.arguments as EsTreeNode[];

        // `localStorage.setItem("token", value)`
        if (callee.type === "MemberExpression" && !callee.computed && callee.property?.name === "setItem" && isWebStorage(callee.object)) {
          if (isStaticValue(args[1])) return;
          if (isSensitiveKey(args[0]) || isSensitiveValue(args[1])) report(node, "`setItem()`");
          return;
        }

        if (callee.type !== "Identifier") return;

        // `useLocalStorage("token", ...)` / `useStorage("token", ..., localStorage)`
        const isStorageComposable =
          STORAGE_COMPOSABLES.has(callee.name) ||
          (callee.name === "useStorage" && (!args[2] || collectNames(args[2], { literals: false }).some((name) => STORAGE_OBJECTS.has(name))));
        if (isStorageComposable && isSensitiveKey(args[0])) return report(node, `\`${callee.name}()\``);

        // Pinia: `defineStore(id, setupOrOptions, { persist })` and `defineStore(id, { state, persist })`
        if (callee.name === "defineStore") {
          const id = args[0]?.type === "Literal" && typeof args[0].value === "string" ? args[0].value : null;
          const second = args[1];
          const objects = [args[2], second].filter((arg): arg is EsTreeNode => arg?.type === "ObjectExpression");
          for (const object of objects) {
            const persist = (object.properties as EsTreeNode[]).find((property) => property.type === "Property" && getStaticKeyName(property) === "persist");
            if (!persist) continue;
            const state = (object.properties as EsTreeNode[]).find((property) => property.type === "Property" && getStaticKeyName(property) === "state");
            // Options stores list their state in the same object; setup stores declare refs in the setup function.
            const stateNames = [...stateKeys(state), ...(second?.type === "ObjectExpression" ? [] : setupStoreNames(second))];
            return checkPersist(persist, id, stateNames);
          }
        }
      },

      AssignmentExpression(node: EsTreeNode) {
        const left: EsTreeNode = node.left;
        if (node.operator !== "=" || left.type !== "MemberExpression" || !isWebStorage(left.object)) return;
        if (isStaticValue(node.right)) return;
        // `localStorage.token = x` / `localStorage["accessToken"] = x`
        const key = left.computed ? left.property : { type: "Literal", value: left.property?.name };
        if (isSensitiveKey(key) || isSensitiveValue(node.right)) report(node, "assigning a property of web storage");
      },
    };
  },
});
