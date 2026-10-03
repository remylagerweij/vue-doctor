import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderConfigFile,
  addScriptsToPackageJson,
  installAgentPlaybooks,
} from "../src/commands/init.js";

describe("init command helpers", () => {
  it("renders a valid config file for strict gate", () => {
    const config = renderConfigFile({
      failOn: "error",
      minScore: 80,
      scope: "new",
      deadCode: true,
      audit: false,
    });

    expect(config).toContain('import { defineConfig } from "@remylagerweij/vue-doctor";');
    expect(config).toContain('failOn: "error"');
    expect(config).toContain("minScore: 80");
    expect(config).toContain('scope: "new"');
    expect(config).toContain("deadCode: true");
    expect(config).not.toContain("audit");
  });

  it("renders config with audit and baseline enabled", () => {
    const config = renderConfigFile({
      failOn: "warning",
      scope: "all",
      deadCode: false,
      audit: true,
      baseline: "vue-doctor-baseline.json",
    });

    expect(config).toContain('failOn: "warning"');
    expect(config).toContain('scope: "all"');
    expect(config).toContain("deadCode: false");
    expect(config).toContain("audit: {");
    expect(config).toContain("enabled: true");
    expect(config).toContain('baseline: "vue-doctor-baseline.json"');
  });

  it("adds doctor scripts to package.json", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-init-pkg-"));
    try {
      const pkgPath = path.join(tmpDir, "package.json");
      fs.writeFileSync(
        pkgPath,
        JSON.stringify({ name: "my-app", scripts: { build: "vite build" } }, null, 2),
      );

      const modified = addScriptsToPackageJson(tmpDir);
      expect(modified).toBe(true);

      const updated = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      expect(updated.scripts.doctor).toBe("vue-doctor");
      expect(updated.scripts["doctor:fix"]).toBe("vue-doctor --fix");
      expect(updated.scripts.build).toBe("vite build");

      // Idempotent on second run
      const reRun = addScriptsToPackageJson(tmpDir);
      expect(reRun).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("installs agent instructions into target files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-init-agents-"));
    try {
      installAgentPlaybooks(tmpDir, ["cursor", "agents-md"]);

      const cursorFile = path.join(tmpDir, ".cursor", "rules", "vue-doctor.mdc");
      expect(fs.existsSync(cursorFile)).toBe(true);
      expect(fs.readFileSync(cursorFile, "utf8")).toContain("Vue Doctor Agent Instructions");

      const agentsMd = path.join(tmpDir, "AGENTS.md");
      expect(fs.existsSync(agentsMd)).toBe(true);
      expect(fs.readFileSync(agentsMd, "utf8")).toContain("Vue Doctor Agent Instructions");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
