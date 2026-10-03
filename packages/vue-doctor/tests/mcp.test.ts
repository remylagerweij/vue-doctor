import path from "node:path";
import { describe, expect, it } from "vitest";
import { McpServer } from "../src/mcp/server.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");

describe("MCP stdio server protocol", () => {
  const server = new McpServer();

  it("handles initialize handshake", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "test-client", version: "1.0.0" } },
    });

    expect(res).toBeDefined();
    expect(res?.result?.protocolVersion).toBe("2024-11-05");
    expect(res?.result?.serverInfo?.name).toBe("vue-doctor");
    expect(res?.result?.capabilities?.tools).toBeDefined();
    expect(res?.result?.capabilities?.resources).toBeDefined();
  });

  it("handles ping", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "ping",
    });

    expect(res?.result).toEqual({});
  });

  it("lists all available tools", () => {
    const res = server.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
    });

    expect(res?.result?.tools).toBeInstanceOf(Array);
    const names = res?.result?.tools.map((t: any) => t.name);
    expect(names).toContain("scan");
    expect(names).toContain("explain_rule");
    expect(names).toContain("list_rules");
    expect(names).toContain("get_fix");
    expect(names).toContain("score");
  });

  it("lists and reads rule resources", () => {
    const listRes = server.handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "resources/list",
    });

    expect(listRes?.result?.resources).toBeInstanceOf(Array);
    const evalRes = listRes?.result?.resources.find((r: any) => r.uri.includes("no-eval"));
    expect(evalRes).toBeDefined();

    const readRes = server.handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: evalRes.uri },
    });

    expect(readRes?.result?.contents).toBeInstanceOf(Array);
    expect(readRes?.result?.contents[0].text).toContain("no-eval");
    expect(readRes?.result?.contents[0].mimeType).toBe("text/markdown");
  });

  it("executes list_rules tool call", async () => {
    const res = await server.executeToolCall(6, "list_rules", { category: "security" });
    expect(res.result?.content[0]?.type).toBe("text");
    const rules = JSON.parse(res.result.content[0].text);
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r: any) => r.category.toLowerCase() === "security")).toBe(true);
  });

  it("executes explain_rule tool call", async () => {
    const res = await server.executeToolCall(7, "explain_rule", { rule_id: "no-eval" });
    expect(res.result?.content[0]?.type).toBe("text");
    const info = JSON.parse(res.result.content[0].text);
    expect(info.ruleId).toBe("vue-doctor/security/no-eval");
    expect(info.agentGuidance).toBeTruthy();
  });

  it("executes get_fix tool call", async () => {
    const res = await server.executeToolCall(8, "get_fix", {
      rule_id: "no-eval",
      file: "src/App.vue",
      line: 42,
    });
    expect(res.result?.content[0]?.text).toContain("Rule: vue-doctor/security/no-eval");
    expect(res.result?.content[0]?.text).toContain("File: src/App.vue:42");
  });

  it("executes score tool call on clean fixture", async () => {
    const cleanDir = path.join(FIXTURES_DIR, "clean-vue");
    const res = await server.executeToolCall(9, "score", { path: cleanDir });
    const data = JSON.parse(res.result.content[0].text);
    expect(data.score).toBeGreaterThanOrEqual(95);
    expect(data.errors).toBe(0);
  });
});
