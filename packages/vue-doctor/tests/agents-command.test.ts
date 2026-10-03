import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  START_MARKER,
  END_MARKER,
  updateMarkedContent,
  removeMarkedContent,
  detectInstalledAgents,
  getTargetFileInfo,
} from "../src/commands/agents.js";

describe("agents install command", () => {
  it("inserts marked block into empty content", () => {
    const block = `${START_MARKER}\nInstructions\n${END_MARKER}`;
    const result = updateMarkedContent("", block);
    expect(result.changed).toBe(true);
    expect(result.content).toBe(`${block}\n`);
  });

  it("appends marked block to existing content with separation", () => {
    const existing = "# My Project\n\nSome guidelines.";
    const block = `${START_MARKER}\nInstructions\n${END_MARKER}`;
    const result = updateMarkedContent(existing, block);

    expect(result.changed).toBe(true);
    expect(result.content).toContain(existing);
    expect(result.content).toContain(block);
  });

  it("updates marked block idempotently in existing file", () => {
    const initial = `# Header\n\n${START_MARKER}\nOld instructions\n${END_MARKER}\n\n# Footer`;
    const updatedBlock = `${START_MARKER}\nNew instructions\n${END_MARKER}`;
    const result = updateMarkedContent(initial, updatedBlock);

    expect(result.changed).toBe(true);
    expect(result.content).toContain("New instructions");
    expect(result.content).not.toContain("Old instructions");
    expect(result.content).toContain("# Header");
    expect(result.content).toContain("# Footer");

    // Re-running with same content should result in changed === false
    const rerun = updateMarkedContent(result.content, updatedBlock);
    expect(rerun.changed).toBe(false);
  });

  it("removes marked content cleanly", () => {
    const content = `# Header\n\n${START_MARKER}\nInstructions\n${END_MARKER}\n\n# Footer`;
    const result = removeMarkedContent(content);

    expect(result.changed).toBe(true);
    expect(result.content).not.toContain(START_MARKER);
    expect(result.content).not.toContain(END_MARKER);
    expect(result.content).toContain("# Header");
    expect(result.content).toContain("# Footer");
  });

  it("detects installed agents based on directory presence", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-agent-detect-"));
    try {
      fs.mkdirSync(path.join(tempDir, ".cursor"));
      fs.mkdirSync(path.join(tempDir, ".claude"));

      const detected = detectInstalledAgents(tempDir);
      expect(detected).toContain("cursor");
      expect(detected).toContain("claude");
      expect(detected).not.toContain("windsurf");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("provides target file info for each agent", () => {
    const claude = getTargetFileInfo(".", "claude");
    expect(claude.relativePath).toContain(".claude");
    expect(claude.isDedicated).toBe(true);

    const copilot = getTargetFileInfo(".", "copilot");
    expect(copilot.relativePath).toContain("copilot-instructions.md");
    expect(copilot.isDedicated).toBe(false);

    const cursor = getTargetFileInfo(".", "cursor");
    expect(cursor.relativePath).toContain(".cursor");
    expect(cursor.content).toContain("globs:");
  });
});
