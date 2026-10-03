import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_DIRECTORY = path.resolve(import.meta.dirname, "..");
const CLI_PATH = path.join(PACKAGE_DIRECTORY, "dist", "cli.js");
const BASIC_VUE_DIRECTORY = path.join(PACKAGE_DIRECTORY, "tests", "fixtures", "basic-vue");

const runCli = (args: string[]) =>
  spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });

describe("CLI output streams", () => {
  it("prints only valid JSON on stdout with --json", () => {
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--json", "--no-dead-code"]);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.format).toBe("vue-doctor/report@2");
    expect(report.projects[0].score.value).toBeTypeOf("number");
    expect(Array.isArray(report.projects[0].findings)).toBe(true);
  });

  it("prints only the score on stdout with --score", () => {
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code"]);

    expect(result.stdout.trim()).toMatch(/^\d{1,3}$/);
  });

  it("keeps the banner and progress on stderr in text mode", () => {
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--no-dead-code"]);

    expect(result.stderr).toContain("Vue Doctor");
    expect(result.stderr).toContain("Running lint checks");
    expect(result.stdout).toContain("Score:");
    expect(result.stdout).not.toContain("Running lint checks");
  });
});

describe("CLI exit codes", () => {
  const PACKAGE_JSON_DIRECTORY = PACKAGE_DIRECTORY;

  it("exits 0 by default even when findings exist", () => {
    expect(runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code"]).status).toBe(0);
  });

  it("exits 1 when --fail-on error is breached and explains why on stderr", () => {
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code", "--fail-on", "error"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--fail-on error");
  });

  it("exits 1 when the score is below --min-score", () => {
    expect(runCli([BASIC_VUE_DIRECTORY, "-y", "--score", "--no-dead-code", "--min-score", "100"]).status).toBe(1);
  });

  it("exits 2 on invalid usage", () => {
    expect(runCli([BASIC_VUE_DIRECTORY, "--fail-on", "sometimes"]).status).toBe(2);
    expect(runCli([BASIC_VUE_DIRECTORY, "--min-score", "101"]).status).toBe(2);
    expect(runCli([BASIC_VUE_DIRECTORY, "--no-such-flag"]).status).toBe(2);
  });

  it("exits 2 when the directory is not a Vue project", () => {
    expect(runCli([PACKAGE_JSON_DIRECTORY, "-y", "--score"]).status).toBe(2);
  });

  it("exits 0 for --help and --version", () => {
    expect(runCli(["--help"]).status).toBe(0);
    expect(runCli(["--version"]).status).toBe(0);
  });
});

describe("CLI flags", () => {
  const categories = (args: string[]): Set<string> => {
    const result = runCli([BASIC_VUE_DIRECTORY, "-y", "--json", ...args]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as { projects: Array<{ findings: Array<{ category: string }> }> };
    return new Set(report.projects[0].findings.map((finding) => finding.category));
  };

  it("runs every analyzer by default and honours --no-lint / --no-dead-code", () => {
    const all = categories([]);
    expect(all.has("Dead Code")).toBe(true);
    expect(all.has("Security")).toBe(true);

    expect([...categories(["--no-lint"])]).toEqual(["Dead Code"]);
    expect(categories(["--no-dead-code"]).has("Dead Code")).toBe(false);
    expect(categories(["--no-lint", "--no-dead-code"]).size).toBe(0);
  }, 120_000);

  it("prints the package version for --version", () => {
    const result = runCli(["--version"]);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("documents the gating flags in --help", () => {
    const { stdout } = runCli(["--help"]);
    for (const flag of ["--fail-on", "--gate", "--min-score", "--strict", "--no-lint", "--no-dead-code"]) {
      expect(stdout).toContain(flag);
    }
  });
});

describe("CLI with a project config", () => {
  const withConfig = (config: unknown): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-doctor-cli-config-"));
    fs.cpSync(BASIC_VUE_DIRECTORY, directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "vue-doctor.config.json"), JSON.stringify(config));
    return directory;
  };

  it("exits 2 with a clear message for an invalid config", () => {
    const directory = withConfig({ ignore: { paths: ["src/**"] } });
    try {
      const result = runCli([directory, "-y", "--score"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Invalid Vue Doctor config");
      expect(result.stderr).toContain('unknown key "ignore.paths" (use "ignore.files")');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses gate settings and analyzer toggles from the config; CLI flags win", () => {
    const directory = withConfig({ gate: { failOn: "warning" }, deadCode: false });
    try {
      const fromConfig = runCli([directory, "-y", "--json"]);
      expect(fromConfig.status).toBe(1);
      const categories = new Set(
        (JSON.parse(fromConfig.stdout) as { projects: Array<{ findings: Array<{ category: string }> }> }).projects[0].findings.map(
          (finding) => finding.category,
        ),
      );
      expect(categories.has("Dead Code")).toBe(false);

      expect(runCli([directory, "-y", "--score", "--fail-on", "none"]).status).toBe(0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
