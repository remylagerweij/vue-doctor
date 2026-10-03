import type { Command } from "commander";

export const registerMcpCommand = (program: Command): void => {
  program
    .command("mcp")
    .description("Start Model Context Protocol (MCP) server over stdio for AI agents")
    .action(async () => {
      const { McpServer } = await import("../mcp/server.js");
      const server = new McpServer();
      server.startStdio();
    });
};
