import readline from "node:readline";
import path from "node:path";
import { diagnose } from "../core/diagnose.js";
import { RULE_REGISTRY, getCanonicalRuleId } from "../plugin/registry.js";
import { findRuleMeta, toRuleInfo } from "../commands/rules.js";
import { getDiffInfo, filterSourceFiles } from "../utils/get-diff-files.js";
import { VERSION } from "../constants.js";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export const TOOLS = [
  {
    name: "scan",
    description: "Run Vue Doctor diagnostics on a Vue.js or Nuxt codebase and return findings and score",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project directory (defaults to current working directory)" },
        scope: { type: "string", enum: ["changed", "full"], description: "Whether to scan changed files only or full repository" },
        files: { type: "array", items: { type: "string" }, description: "Specific relative file paths to scan" },
      },
    },
  },
  {
    name: "explain_rule",
    description: "Get detailed explanation, security context, and agent guidance for a rule",
    inputSchema: {
      type: "object",
      properties: {
        rule_id: { type: "string", description: "Rule identifier (e.g. 'vue-doctor/security/no-eval' or 'no-eval')" },
      },
      required: ["rule_id"],
    },
  },
  {
    name: "list_rules",
    description: "List all diagnostic rules and metadata supported by Vue Doctor",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category to filter by (e.g. 'Security', 'Reactivity')" },
      },
    },
  },
  {
    name: "get_fix",
    description: "Get targeted remediation guidance, code snippet instructions, or AI fix prompt for a finding",
    inputSchema: {
      type: "object",
      properties: {
        rule_id: { type: "string", description: "Rule identifier" },
        file: { type: "string", description: "File path where issue occurred" },
        line: { type: "number", description: "Line number" },
      },
      required: ["rule_id"],
    },
  },
  {
    name: "score",
    description: "Calculate and return the 0-100 health score and summary metrics for a project",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project directory (defaults to current directory)" },
      },
    },
  },
];

export class McpServer {
  public handleRequest(req: JsonRpcRequest): JsonRpcResponse | null {
    const { id = null, method, params } = req;

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: "vue-doctor",
              version: VERSION,
            },
          },
        };

      case "notifications/initialized":
        return null;

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

      case "resources/list": {
        const resources = RULE_REGISTRY.map((meta) => {
          const ruleId = getCanonicalRuleId(meta);
          return {
            uri: `rule://${ruleId}`,
            name: ruleId,
            description: meta.help,
            mimeType: "text/markdown",
          };
        });
        return { jsonrpc: "2.0", id, result: { resources } };
      }

      case "resources/read": {
        const uri = params?.uri as string;
        if (!uri || !uri.startsWith("rule://")) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Invalid resource URI: ${uri}` },
          };
        }
        const ruleId = uri.replace("rule://", "");
        const meta = findRuleMeta(ruleId);
        if (!meta) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Rule not found: ${ruleId}` },
          };
        }
        const info = toRuleInfo(meta);
        const text = `# ${info.ruleId}\n\n**Category:** ${info.category}\n**Severity:** ${info.severity}\n**Docs:** ${info.docsUrl}\n\n## Description\n${info.help}\n\n## Agent Guidance\n${info.agentGuidance}\n`;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            contents: [{ uri, mimeType: "text/markdown", text }],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  public async executeToolCall(id: number | string | null, name: string, args: any = {}): Promise<JsonRpcResponse> {
    try {
      switch (name) {
        case "list_rules": {
          let rules = RULE_REGISTRY.map(toRuleInfo);
          if (args.category) {
            const cat = args.category.toLowerCase();
            rules = rules.filter((r) => r.category.toLowerCase() === cat);
          }
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(rules, null, 2),
                },
              ],
            },
          };
        }

        case "explain_rule": {
          const ruleId = args.rule_id;
          const meta = findRuleMeta(ruleId);
          if (!meta) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                isError: true,
                content: [{ type: "text", text: `Rule not found: "${ruleId}"` }],
              },
            };
          }
          const info = toRuleInfo(meta);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
            },
          };
        }

        case "get_fix": {
          const ruleId = args.rule_id;
          const file = args.file ?? "src/Component.vue";
          const line = args.line ?? 1;
          const meta = findRuleMeta(ruleId);
          if (!meta) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                isError: true,
                content: [{ type: "text", text: `Rule not found: "${ruleId}"` }],
              },
            };
          }
          const info = toRuleInfo(meta);
          const prompt = [
            `Rule: ${info.ruleId} (${info.severity}${info.cwe ? `, ${info.cwe.join(", ")}` : ""})`,
            `File: ${file}:${line}`,
            `Problem: ${info.help}`,
            `Guidance: ${info.agentGuidance}`,
            `Docs: ${info.docsUrl}`,
            `Fixable: ${info.fixable ? "Yes (use `vue-doctor . --fix`)" : "Manual"}`,
          ].join("\n");

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: prompt }],
            },
          };
        }

        case "score": {
          const projectDir = path.resolve(args.path ?? ".");
          const res = await diagnose(projectDir);
          const score = res.score ?? 100;
          const errors = res.diagnostics.filter((d) => d.severity === "error").length;
          const warnings = res.diagnostics.filter((d) => d.severity === "warning").length;

          const summary = {
            score,
            errors,
            warnings,
            diagnosticsCount: res.diagnostics.length,
            skipped: res.skipped,
          };

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
            },
          };
        }

        case "scan": {
          const projectDir = path.resolve(args.path ?? ".");
          let includePaths: string[] | undefined = args.files;

          if (!includePaths && args.scope === "changed") {
            const diffInfo = getDiffInfo(projectDir);
            if (diffInfo.status === "ok") {
              includePaths = filterSourceFiles(diffInfo.changedFiles);
            }
          }

          const res = await diagnose(projectDir, {
            includePaths,
          });

          const findings = res.diagnostics.map((d) => ({
            ruleId: d.rule,
            severity: d.severity,
            file: d.filePath,
            line: d.line,
            column: d.column,
            message: d.message,
            help: d.help,
            fingerprint: d.fingerprint,
          }));

          const output = {
            score: res.score ?? 100,
            summary: {
              errors: res.diagnostics.filter((d) => d.severity === "error").length,
              warnings: res.diagnostics.filter((d) => d.severity === "warning").length,
              totalFindings: findings.length,
            },
            findings,
            skipped: res.skipped,
          };

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
            },
          };
        }

        default:
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Tool not found: ${name}` },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: `Error executing tool "${name}": ${err.message}` }],
        },
      };
    }
  }

  public startStdio(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on("line", async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const req: JsonRpcRequest = JSON.parse(trimmed);
        if (req.method === "tools/call") {
          const res = await this.executeToolCall(req.id ?? null, req.params?.name, req.params?.arguments);
          process.stdout.write(JSON.stringify(res) + "\n");
        } else {
          const res = this.handleRequest(req);
          if (res) {
            process.stdout.write(JSON.stringify(res) + "\n");
          }
        }
      } catch (err: any) {
        const errRes: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` },
        };
        process.stdout.write(JSON.stringify(errRes) + "\n");
      }
    });
  }
}
