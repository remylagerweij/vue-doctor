import {
  SECRET_FALSE_POSITIVE_SUFFIXES,
  SECRET_MIN_LENGTH_CHARS,
  SECRET_PATTERNS,
  SECRET_VARIABLE_PATTERN,
} from "../constants.js";
import type { EsTreeNode, Rule, RuleContext } from "../types.js";

const getLastSegment = (name: string): string => {
  const segments = name.split(/(?=[A-Z])|_/);
  return segments[segments.length - 1].toLowerCase();
};

export const noSecretsInClientCode: Rule = {
  create: (context: RuleContext) => ({
    VariableDeclarator(node: EsTreeNode) {
      if (node.init?.type !== "Literal" || typeof node.init.value !== "string") return;
      if (node.id?.type !== "Identifier") return;

      const variableName = node.id.name;
      const value = node.init.value;

      if (value.length < SECRET_MIN_LENGTH_CHARS) return;

      const lastSegment = getLastSegment(variableName);
      if (SECRET_FALSE_POSITIVE_SUFFIXES.has(lastSegment)) return;

      const isSecretPattern = SECRET_PATTERNS.some((pattern) => pattern.test(value));
      const isSecretVariable = SECRET_VARIABLE_PATTERN.test(variableName);

      if (isSecretPattern || isSecretVariable) {
        context.report({
          node,
          message: `Potential secret in client code "${variableName}" — move to server-side environment variable`,
        });
      }
    },
  }),
};

export const noEval: Rule = {
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNode) {
      if (node.callee?.type === "Identifier" && node.callee.name === "eval") {
        context.report({
          node,
          message: "eval() is a security risk — use safer alternatives",
        });
      }
    },
  }),
};
