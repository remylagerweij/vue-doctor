import * as espree from "espree";
import { describe, expect, it } from "vitest";
import {
  collectPatternNames,
  createApiResolver,
  findDeferringCall,
  findPrecedingAwait,
  functionNameOf,
  isComponentSetup,
  isGuardedByInstanceCheck,
  isInComponentContext,
  isResultUsed,
} from "../src/plugin/composition-api.js";
import { walkAst } from "../src/plugin/helpers.js";
import type { EsTreeNode } from "../src/plugin/types.js";

// The Composition API helpers run inside oxlint's JS-plugin host, which coverage cannot see; the
// rule cases cover them end to end, these tests pin the individual decisions in-process.

const parse = (code: string): EsTreeNode => {
  const program = espree.parse(code, { ecmaVersion: "latest", sourceType: "module", range: true }) as unknown as EsTreeNode;
  const link = (node: EsTreeNode, parent: EsTreeNode | null): void => {
    node.parent = parent;
    for (const [key, value] of Object.entries(node)) {
      if (key === "parent") continue;
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child === "object" && typeof (child as EsTreeNode).type === "string") link(child as EsTreeNode, node);
      }
    }
  };
  link(program, null);
  return program;
};

/** The call to `name` (the first one, or the nth). */
const findCall = (program: EsTreeNode, name: string, nth = 0): EsTreeNode => {
  const calls: EsTreeNode[] = [];
  walkAst(program, (node) => {
    if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === name) calls.push(node);
  });
  if (!calls[nth]) throw new Error(`no call to ${name}`);
  return calls[nth];
};

describe("createApiResolver", () => {
  it("resolves Vue imports, aliases and auto-imports, and never a local namesake", () => {
    const program = parse(
      `import { onMounted as mounted, watch } from "vue";\nimport { useRoute } from "vue-router";\nimport { inject } from "tsyringe";\nmounted(); watch(); useRoute(); inject(); provide(); useRouter(); unknown();\nfunction f({ onUnmounted }) { onUnmounted(); }`,
    );
    const { resolve } = createApiResolver(program);
    expect(resolve(findCall(program, "mounted").callee)).toEqual({ name: "onMounted", kind: "instance" });
    expect(resolve(findCall(program, "watch").callee)).toEqual({ name: "watch", kind: "watcher" });
    expect(resolve(findCall(program, "useRoute").callee)).toEqual({ name: "useRoute", kind: "instance" });
    expect(resolve(findCall(program, "inject").callee)).toBeNull();
    expect(resolve(findCall(program, "provide").callee)).toEqual({ name: "provide", kind: "instance" });
    expect(resolve(findCall(program, "useRouter").callee)).toBeNull();
    expect(resolve(findCall(program, "unknown").callee)).toBeNull();
    expect(resolve(findCall(program, "onUnmounted").callee)).toBeNull();
    expect(resolve({ type: "MemberExpression" })).toBeNull();
  });

  it("indexes plain identifier declarators", () => {
    const program = parse(`const state = reactive({}); let { a } = b; function f() { const state = 2; }`);
    const { declarators } = createApiResolver(program);
    expect(declarators.get("state")).toHaveLength(2);
    expect(declarators.has("a")).toBe(false);
  });

});

describe("collectPatternNames", () => {
  it("collects every bound name", () => {
    const program = parse(`const { a, b: [c, ...d], e = 1, ...f } = x;`);
    const declarator = program.body[0].declarations[0];
    expect(collectPatternNames(declarator.id)).toEqual(["a", "c", "d", "e", "f"]);
  });
});

describe("findPrecedingAwait", () => {
  const precedes = (code: string, name = "inject"): boolean => Boolean(findPrecedingAwait(findCall(parse(code), name)));

  it("finds an await before the call in the same async function", () => {
    expect(precedes(`async function f() { await a(); inject(); }`)).toBe(true);
    expect(precedes(`async function f() { provide(await a()); }`, "provide")).toBe(true);
    expect(precedes(`async function f() { try { await a(); } catch {} inject(); }`)).toBe(true);
    expect(precedes(`async function f(s) { for await (const x of s) {} inject(); }`)).toBe(true);
    expect(precedes(`async function f(s) { for await (const x of s) { inject(); } }`)).toBe(true);
  });

  it("ignores awaits that cannot have run before the call", () => {
    expect(precedes(`async function f() { inject(); await a(); }`)).toBe(false);
    expect(precedes(`function f() { inject(); }`)).toBe(false);
    expect(precedes(`await a(); inject();`)).toBe(false);
    expect(precedes(`async function f() { await g(inject()); }`)).toBe(false);
    expect(precedes(`async function f(c) { if (c) { await a(); return; } inject(); }`)).toBe(false);
    expect(precedes(`async function f(c) { if (c) await a(); else inject(); }`)).toBe(false);
    expect(precedes(`async function f(c) { return c ? await a() : inject(); }`)).toBe(false);
    expect(precedes(`async function f(c) { if (c) return await a(); inject(); }`)).toBe(false);
    expect(precedes(`async function f(c) { switch (c) { case 1: await a(); break; default: inject(); } }`)).toBe(false);
    expect(precedes(`async function f() { try { inject(); } catch { await a(); } }`)).toBe(false);
    expect(precedes(`async function f() { await (async () => {})(); inject(); }`)).toBe(true);
    expect(precedes(`async function f() { const g = async () => { await a(); }; inject(); }`)).toBe(false);
    expect(precedes(`async function f(s) { for await (const x of inject()) {} }`)).toBe(false);
  });

  it("leaves Nuxt async contexts alone", () => {
    expect(precedes(`defineNuxtPlugin(async () => { await a(); inject(); });`)).toBe(false);
    expect(precedes(`defineNuxtComponent({ async setup() { await a(); inject(); } });`)).toBe(false);
    expect(precedes(`definePageMeta({ middleware: async () => { await a(); inject(); } });`)).toBe(false);
  });
});

describe("findDeferringCall", () => {
  const deferring = (code: string, name = "onMounted"): string | null => {
    const program = parse(code);
    return findDeferringCall(findCall(program, name), createApiResolver(program));
  };

  it("names the API that runs the callback later", () => {
    expect(deferring(`setTimeout(() => onMounted(f));`)).toBe("setTimeout");
    expect(deferring(`window.requestAnimationFrame(() => onMounted(f));`)).toBe("requestAnimationFrame");
    expect(deferring(`nextTick(() => onMounted(f));`)).toBe("nextTick");
    expect(deferring(`this.$nextTick(() => onMounted(f));`)).toBe("$nextTick");
    expect(deferring(`p.then(() => onMounted(f));`)).toBe(".then()");
    expect(deferring(`el.addEventListener("x", () => onMounted(f));`)).toBe("addEventListener");
    expect(deferring(`watch(s, () => onMounted(f));`)).toBe("watch");
    expect(deferring(`watch(s, () => onMounted(f), { immediate: false });`)).toBe("watch");
  });

  it("returns null for callbacks that run in setup or restore a context", () => {
    expect(deferring(`onMounted(f);`)).toBeNull();
    expect(deferring(`list.forEach(() => onMounted(f));`)).toBeNull();
    expect(deferring(`watch(s, () => onMounted(f), { immediate: true });`)).toBeNull();
    expect(deferring(`setTimeout(() => app.runWithContext(() => onMounted(f)));`)).toBeNull();
    expect(deferring(`foo.setTimeout(() => onMounted(f));`)).toBeNull();
    expect(deferring(`el.addEventListener(() => onMounted(f));`)).toBeNull();
    expect(deferring(`setTimeout(f, () => onMounted(f));`)).toBeNull();
    expect(deferring(`obj[key](() => onMounted(f));`)).toBeNull();
    expect(deferring(`(0, run)(() => onMounted(f));`)).toBeNull();
  });
});

describe("isGuardedByInstanceCheck", () => {
  const guarded = (code: string): boolean => isGuardedByInstanceCheck(findCall(parse(code), "onUnmounted"));
  it("recognises instance checks around the call", () => {
    expect(guarded(`if (getCurrentInstance()) onUnmounted(f);`)).toBe(true);
    expect(guarded(`getCurrentScope() && onUnmounted(f);`)).toBe(true);
    expect(guarded(`hasInjectionContext() ? onUnmounted(f) : null;`)).toBe(true);
    expect(guarded(`if (ready) onUnmounted(f);`)).toBe(false);
    expect(guarded(`if (getCurrentInstance()) setTimeout(() => onUnmounted(f));`)).toBe(false);
  });
});

describe("isComponentSetup and isInComponentContext", () => {
  const setupOf = (program: EsTreeNode): EsTreeNode => {
    let found: EsTreeNode | null = null;
    walkAst(program, (node) => {
      if (!found && node.type === "Property" && node.key?.name === "setup") found = node.value;
    });
    return found!;
  };

  it("accepts component setup() and rejects other setup methods", () => {
    expect(isComponentSetup(setupOf(parse(`defineComponent({ setup() {} });`)), "a.ts")).toBe(true);
    expect(isComponentSetup(setupOf(parse(`Vue.extend({ setup() {} });`)), "a.ts")).toBe(true);
    expect(isComponentSetup(setupOf(parse(`export default { setup() {} };`)), "a.vue")).toBe(true);
    expect(isComponentSetup(setupOf(parse(`export default { setup() {} };`)), "a.ts")).toBe(false);
    expect(isComponentSetup(setupOf(parse(`export const c = { props: {}, setup() {} };`)), "a.ts")).toBe(true);
    expect(isComponentSetup(setupOf(parse(`export const p = { name: "x", setup(build) {} };`)), "a.ts")).toBe(false);
    expect(isComponentSetup(parse(`function setup() {}`).body[0], "a.ts")).toBe(false);
  });

  it("knows which code runs for a component", () => {
    const program = parse(`function useX() { watch(a); }\nfunction boot() { watch(b); }\nconst c = defineComponent({ setup() { watch(c); } });`);
    expect(isInComponentContext(findCall(program, "watch", 0), "a.ts")).toBe(true);
    expect(isInComponentContext(findCall(program, "watch", 1), "a.ts")).toBe(false);
    expect(isInComponentContext(findCall(program, "watch", 2), "a.ts")).toBe(true);
    expect(isInComponentContext(findCall(program, "watch", 1), "a.vue")).toBe(true);
  });

  it("names functions by declaration, variable or property", () => {
    const program = parse(`function useA() {}\nconst useB = () => {};\nconst o = { useC() {}, ["x"]: function () {} };\n(function () {})();`);
    const names: (string | null)[] = [];
    walkAst(program, (node) => {
      if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
        names.push(functionNameOf(node));
      }
    });
    expect(names).toEqual(["useA", "useB", "useC", null, null]);
  });
});

describe("isResultUsed", () => {
  const used = (code: string): boolean => isResultUsed(findCall(parse(code), "watch"));
  it("tells a kept stop handle from a discarded one", () => {
    expect(used(`watch(a, b);`)).toBe(false);
    expect(used(`void watch(a, b);`)).toBe(false);
    expect(used(`const stop = watch(a, b);`)).toBe(true);
    expect(used(`stops.push(watch(a, b));`)).toBe(true);
    expect(used(`function f() { return watch(a, b); }`)).toBe(true);
  });
});
