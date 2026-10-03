import { defineRule } from "../../define-rule.js";
import { createRequestInputTracker, peel } from "../../request-input.js";
import type { EsTreeNode, RuleContext, RuleVisitors } from "../../types.js";

const LLM_COMPLETION_METHODS = new Set([
  "create",
  "generateText",
  "streamText",
  "generateObject",
  "streamObject",
  "chat",
]);

export default defineRule({
  meta: {
    id: "llm-prompt-injection",
    category: "Security",
    defaultSeverity: "warning",
    confidence: "low",
    frameworks: ["vue", "nuxt"],
    cwe: ["CWE-20"],
    owasp: "LLM01:2025",
    fixable: false,
    since: "2.0.0",
    help: "Do not concatenate untrusted user input directly into system prompts or instructions (prompt injection risk)",
    agentGuidance:
      "Keep system prompts and developer instructions fixed or parameterized via distinct message roles (`{ role: 'user', content: userInput }` rather than interpolating into `{ role: 'system' }`). " +
      "Always configure output length boundaries (`max_tokens` / `maxTokens`) and input validation for AI/LLM endpoints.",
  },
  create: (context: RuleContext): RuleVisitors => {
    const input = createRequestInputTracker();

    return {
      VariableDeclarator(node: EsTreeNode) {
        input.recordDeclarator(node);
      },

      AssignmentExpression(node: EsTreeNode) {
        input.recordAssignment(node);
      },

      Property(node: EsTreeNode) {
        if (node.computed) return;
        const key = node.key?.type === "Identifier" ? node.key.name : node.key?.value;
        const val = peel(node.value);

        // Check { role: "system", content: `...${input}...` }
        if (key === "role" && val.type === "Literal" && val.value === "system" && node.parent?.type === "ObjectExpression") {
          for (const sibling of node.parent.properties as EsTreeNode[]) {
            if (sibling.type === "Property" && !sibling.computed) {
              const siblingKey = sibling.key?.type === "Identifier" ? sibling.key.name : sibling.key?.value;
              if (siblingKey === "content" && input.isInput(sibling.value)) {
                context.report({
                  node: sibling,
                  message: "system prompt contains untrusted request input — risk of prompt injection and instruction override; pass user input under role: 'user'",
                });
              }
            }
          }
        }

        // Check system: `...${input}...`
        if (key === "system" && input.isInput(node.value)) {
          context.report({
            node,
            message: "system instruction contains concatenated user input — keep system instructions fixed and pass user input as messages",
          });
        }
      },

      CallExpression(node: EsTreeNode) {
        const callee = peel(node.callee);
        let methodName: string | null = null;
        if (callee.type === "Identifier") {
          methodName = callee.name;
        } else if (callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
          methodName = callee.property.name;
        }

        if (methodName && LLM_COMPLETION_METHODS.has(methodName)) {
          const arg = node.arguments?.[0];
          if (arg?.type === "ObjectExpression") {
            const hasMaxTokens = (arg.properties as EsTreeNode[]).some((prop) => {
              if (prop.type !== "Property" || prop.computed) return false;
              const name = prop.key?.type === "Identifier" ? prop.key.name : prop.key?.value;
              return name === "max_tokens" || name === "maxTokens";
            });

            // If prompt is present but max_tokens is missing
            const hasPromptOrMessages = (arg.properties as EsTreeNode[]).some((prop) => {
              if (prop.type !== "Property" || prop.computed) return false;
              const name = prop.key?.type === "Identifier" ? prop.key.name : prop.key?.value;
              return name === "prompt" || name === "messages";
            });

            if (hasPromptOrMessages && !hasMaxTokens) {
              context.report({
                node,
                message: `LLM call \`${methodName}\` does not set \`max_tokens\` / \`maxTokens\` — unbounded response generation may cause resource exhaustion or denial of wallet`,
              });
            }
          }
        }
      },
    };
  },
});
