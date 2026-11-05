import type { RuleOptionSchema } from "../plugin/define-rule.js";
import { optionEntries, rulesForKey } from "./rule-options.js";
import type { VueDoctorConfig } from "./schema.js";

const matchesType = (schema: RuleOptionSchema, value: unknown): boolean => {
  if (schema.type === "array") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (typeof value !== schema.type) return false;
  return !schema.enum || schema.enum.includes(value as string);
};

const describeType = (schema: RuleOptionSchema): string =>
  schema.type === "array"
    ? "an array of strings"
    : schema.enum
      ? `one of ${schema.enum.map((value) => JSON.stringify(value)).join(", ")}`
      : `a ${schema.type}`;

/** Problems with options given to rules that declare options (unknown names, wrong types), as config issues. */
export const validateRuleOptions = (config: VueDoctorConfig): string[] => {
  const issues: string[] = [];
  for (const [key, options] of optionEntries(config)) {
    for (const { ruleMeta } of rulesForKey(key)) {
      const schema = ruleMeta.options;
      if (!schema) continue;
      for (const [name, value] of Object.entries(options)) {
        const property = schema.properties[name];
        if (!property) {
          issues.push(`rules["${key}"]: unknown option "${name}" (accepted: ${Object.keys(schema.properties).join(", ")})`);
        } else if (!matchesType(property, value)) {
          issues.push(`rules["${key}"]: option "${name}" must be ${describeType(property)}`);
        }
      }
    }
  }
  return issues;
};

