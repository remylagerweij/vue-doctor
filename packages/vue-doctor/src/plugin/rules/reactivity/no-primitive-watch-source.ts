import { createApiResolver, isComponentSetup, peel, type ApiResolver } from "../../composition-api.js";
import { defineRule } from "../../define-rule.js";
import { getFilename, getStaticKeyName, isFunctionNode, walkAst } from "../../helpers.js";
import type { EsTreeNode, RuleContext } from "../../types.js";

const PRIMITIVE_TS_TYPES = new Set([
  "TSStringKeyword",
  "TSNumberKeyword",
  "TSBooleanKeyword",
  "TSBigIntKeyword",
  "TSLiteralType",
  "TSUndefinedKeyword",
  "TSNullKeyword",
]);
const PRIMITIVE_CONSTRUCTORS = new Set(["String", "Number", "Boolean", "BigInt"]);

const isPrimitiveLiteral = (node: EsTreeNode | null | undefined): boolean => {
  const value = peel(node);
  if (!value) return false;
  if (value.type === "Literal") return !(value as { regex?: unknown }).regex;
  if (value.type === "TemplateLiteral") return (value.expressions ?? []).length === 0;
  if (value.type === "UnaryExpression" && (value.operator === "-" || value.operator === "+")) return value.argument?.type === "Literal";
  return value.type === "Identifier" && value.name === "undefined";
};

/** `string`, `number | undefined`, `'a' | 'b'`: a TS type that only admits primitives. */
const isPrimitiveTsType = (type: EsTreeNode | null | undefined): boolean => {
  if (!type) return false;
  if (type.type === "TSUnionType") return (type.types ?? []).every(isPrimitiveTsType);
  if (type.type === "TSLiteralType") return type.literal?.type !== "TemplateLiteral" || (type.literal.expressions ?? []).length === 0;
  return PRIMITIVE_TS_TYPES.has(type.type);
};

/** `Number`, `{ type: String }`: a runtime prop declaration whose value is always a primitive. */
const isPrimitivePropOption = (value: EsTreeNode | null | undefined): boolean => {
  const option = peel(value);
  if (option?.type === "Identifier") return PRIMITIVE_CONSTRUCTORS.has(option.name);
  if (option?.type !== "ObjectExpression") return false;
  const type = (option.properties ?? []).find(
    (property: EsTreeNode) => property.type === "Property" && getStaticKeyName(property) === "type",
  );
  return Boolean(type) && isPrimitivePropOption(type.value);
};

const findProperty = (object: EsTreeNode | null | undefined, key: string): EsTreeNode | null =>
  (object?.type === "ObjectExpression"
    ? (object.properties ?? []).find((property: EsTreeNode) => property.type === "Property" && getStaticKeyName(property) === key)
    : null) ?? null;

const nearestFunction = (node: EsTreeNode): EsTreeNode | null => {
  for (let current = node.parent; current; current = current.parent) if (isFunctionNode(current)) return current;
  return null;
};

export default defineRule({
  meta: {
    id: "no-primitive-watch-source",
    category: "Reactivity",
    defaultSeverity: "off",
    confidence: "high",
    frameworks: ["vue", "nuxt"],
    fixable: false,
    skipTestFiles: true,
    since: "2.5.0",
    help: "Watch a getter instead of the value: `watch(() => props.count, ...)`, `watch(() => state.count, ...)`, or pass the ref itself: `watch(count, ...)`",
    agentGuidance:
      "`watch(state.count, cb)`, `watch(props.count, cb)` and `watch(count.value, cb)` evaluate the expression once and pass its current value; when that value is a string, number, boolean, null or undefined Vue cannot track it, logs \"Invalid watch source\" and the callback never runs. Pass a getter (`watch(() => props.count, cb)`), the ref itself (`watch(count, cb)`), or an array of those. Only sources that are certainly primitive are reported: a `reactive({ count: 0 })` property, a prop declared as `string`/`number`/`boolean` (type-based or runtime `defineProps`, or `props: { count: Number }`), or a ref created with a primitive in the same function.",
  },
  create: (context: RuleContext) => {
    let resolver: ApiResolver | null = null;
    let program: EsTreeNode | null = null;
    const filename = getFilename(context);

    /** Every declaration of `name` in the file, when they all are calls to one of `apis`. */
    const callsOf = (name: string, apis: ReadonlySet<string>): EsTreeNode[] => {
      const declarations = resolver?.declarators.get(name) ?? [];
      const calls = declarations.map((declarator) => {
        const init = peel(declarator.init);
        const api = init?.type === "CallExpression" ? resolver?.resolve(init.callee) : null;
        return api && apis.has(api.name) ? init : null;
      });
      return calls.length > 0 && calls.every(Boolean) ? (calls as EsTreeNode[]) : [];
    };

    /** Type declaration a `defineProps<Props>()` type argument refers to, when declared in this file. */
    const resolveTypeLiteral = (type: EsTreeNode | null | undefined): EsTreeNode[] | null => {
      if (type?.type === "TSTypeLiteral") return type.members ?? [];
      if (type?.type !== "TSTypeReference" || type.typeName?.type !== "Identifier" || type.typeArguments || type.typeParameters) return null;
      const name = type.typeName.name;
      let members: EsTreeNode[] | null = null;
      if (program) {
        walkAst(program, (node) => {
          if (members) return;
          if (node.type === "TSInterfaceDeclaration" && node.id?.name === name && !(node.extends ?? []).length) members = node.body?.body ?? [];
          if (node.type === "TSTypeAliasDeclaration" && node.id?.name === name && node.typeAnnotation?.type === "TSTypeLiteral") {
            members = node.typeAnnotation.members ?? [];
          }
        });
      }
      return members;
    };

    const isPrimitivePropOfDefineProps = (definePropsCall: EsTreeNode, key: string): boolean => {
      const typeArgument = (definePropsCall.typeArguments ?? definePropsCall.typeParameters)?.params?.[0];
      if (typeArgument) {
        const member = resolveTypeLiteral(typeArgument)?.find(
          (candidate) => candidate.type === "TSPropertySignature" && !candidate.computed && getStaticKeyName(candidate) === key,
        );
        return Boolean(member) && isPrimitiveTsType(member!.typeAnnotation?.typeAnnotation);
      }
      return isPrimitivePropOption(findProperty(peel(definePropsCall.arguments?.[0]), key)?.value);
    };

    /** `props.x` where `props` comes from `defineProps` or a component `setup(props)` with `props: { x: Number }`. */
    const isPrimitiveProp = (objectName: string, key: string, at: EsTreeNode): boolean => {
      const [call] = callsOf(objectName, new Set(["defineProps", "withDefaults"]));
      if (call) {
        const api = resolver?.resolve(call.callee);
        const defineProps = api?.name === "withDefaults" ? peel(call.arguments?.[0]) : call;
        return defineProps?.type === "CallExpression" && resolver?.resolve(defineProps.callee)?.name === "defineProps"
          ? isPrimitivePropOfDefineProps(defineProps, key)
          : false;
      }
      const setup = nearestFunction(at);
      if (!setup || !isComponentSetup(setup, filename)) return false;
      if (setup.params?.[0]?.type !== "Identifier" || setup.params[0].name !== objectName) return false;
      const propsOption = findProperty(setup.parent?.parent, "props");
      return isPrimitivePropOption(findProperty(peel(propsOption?.value), key)?.value);
    };

    /** `state.a.b` where `state = reactive({ a: { b: 0 } })`. */
    const isPrimitiveReactiveProperty = (source: EsTreeNode): boolean => {
      const path: string[] = [];
      let current: EsTreeNode | null = source;
      while (current?.type === "MemberExpression" && !current.computed && current.property?.type === "Identifier") {
        path.unshift(current.property.name);
        current = peel(current.object);
      }
      if (current?.type !== "Identifier" || path.length === 0) return false;
      const calls = callsOf(current.name, new Set(["reactive", "shallowReactive"]));
      if (calls.length !== 1) return false;
      let value: EsTreeNode | null = peel(calls[0].arguments?.[0]);
      for (const key of path) value = peel(findProperty(value, key)?.value);
      return isPrimitiveLiteral(value);
    };

    /** `count.value` where `count = ref(0)` is declared in the same function as the watch call. */
    const isPrimitiveRefValue = (source: EsTreeNode): boolean => {
      if (source.type !== "MemberExpression" || source.computed || source.property?.name !== "value") return false;
      const object = peel(source.object);
      if (object?.type !== "Identifier") return false;
      const calls = callsOf(object.name, new Set(["ref", "shallowRef"]));
      if (calls.length !== 1) return false;
      const argument = calls[0].arguments?.[0];
      if (argument && !isPrimitiveLiteral(argument)) return false;
      return nearestFunction(calls[0]) === nearestFunction(source);
    };

    const describe = (source: EsTreeNode): string | null => {
      if (source.type !== "MemberExpression" || source.computed) return null;
      if (isPrimitiveRefValue(source)) return "the current value of a ref holding a primitive";
      const object = peel(source.object);
      if (object?.type === "Identifier" && source.property?.type === "Identifier" && isPrimitiveProp(object.name, source.property.name, source)) {
        return "a primitive prop value";
      }
      if (isPrimitiveReactiveProperty(source)) return "a primitive property of a reactive object";
      return null;
    };

    return {
      Program(node: EsTreeNode) {
        program = node;
        resolver = createApiResolver(node);
      },
      CallExpression(node: EsTreeNode) {
        if (resolver?.resolve(node.callee)?.name !== "watch") return;
        const argument = peel(node.arguments?.[0]);
        if (!argument) return;
        const sources = argument.type === "ArrayExpression" ? (argument.elements ?? []).map(peel) : [argument];
        for (const source of sources) {
          if (!source) continue;
          const description = describe(source);
          if (!description) continue;
          context.report({
            node: source,
            message: `watch() is given ${description}, not a reactive source: Vue logs "Invalid watch source" and the callback never runs. Watch a getter instead (\`() => props.x\`) or the ref itself`,
          });
        }
      },
    };
  },
});
