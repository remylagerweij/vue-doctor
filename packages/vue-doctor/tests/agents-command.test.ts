import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  START_MARKER,
  END_MARKER,
  updateMarkedContent,
  removeMarkedContent,
  detectInstalledAgents,
  getTargetFileInfo,
  applyHooks,
  type HookInstallOptions,
} from "../src/commands/agents.js";
import {
  PRE_COMMIT_MARKER,
  isVueDoctorHookCommand,
  mergeClaudeHook,
  mergeCursorHook,
  removeClaudeHook,
  removeCursorHook,
} from "../src/commands/agent-hooks.js";
import { runAgentHook } from "../src/commands/agent-hook-run.js";

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

const RUNNER = "npx --yes @remylagerweij/vue-doctor";
const CLAUDE_COMMAND = `${RUNNER} agents hook claude`;
const CURSOR_COMMAND = `${RUNNER} agents hook cursor`;

const git = (cwd: string, ...args: string[]): void => {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "pipe",
  });
};

const initRepo = (root: string, withCommit = true): void => {
  git(root, "init", "--quiet");
  git(root, "symbolic-ref", "HEAD", "refs/heads/main");
  if (withCommit) {
    fs.writeFileSync(path.join(root, "README.md"), "# test\n");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "init");
  }
};

const read = (root: string, relativePath: string): string => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = (root: string, relativePath: string): any => JSON.parse(read(root, relativePath));

const hookOptions = (overrides: Partial<HookInstallOptions> = {}): HookInstallOptions => ({
  hooks: false,
  preCommit: false,
  dryRun: false,
  remove: false,
  runner: RUNNER,
  ...overrides,
});

describe("agents install --hooks", { timeout: 60_000 }, () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-agent-hooks-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates .claude/settings.json with a Stop command hook", () => {
    applyHooks(dir, ["claude"], hookOptions({ hooks: true }));

    const settings = readJson(dir, ".claude/settings.json");
    expect(settings.hooks.Stop).toHaveLength(1);
    const handler = settings.hooks.Stop[0].hooks[0];
    expect(handler.type).toBe("command");
    expect(handler.command).toBe(CLAUDE_COMMAND);
    expect(handler.timeout).toBe(60);
    expect(fs.existsSync(path.join(dir, ".cursor", "hooks.json"))).toBe(false);
  });

  it("creates .cursor/hooks.json with a stop hook limited to one follow-up", () => {
    applyHooks(dir, ["cursor"], hookOptions({ hooks: true }));

    const config = readJson(dir, ".cursor/hooks.json");
    expect(config.version).toBe(1);
    expect(config.hooks.stop).toEqual([{ command: CURSOR_COMMAND, timeout: 60, loop_limit: 1 }]);
    expect(fs.existsSync(path.join(dir, ".claude", "settings.json"))).toBe(false);
  });

  it("only touches Claude Code and Cursor, whatever else is targeted", () => {
    applyHooks(dir, ["copilot", "windsurf"], hookOptions({ hooks: true }));

    expect(fs.existsSync(path.join(dir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".cursor"))).toBe(false);
  });

  it("merges into an existing Claude settings file without clobbering user keys", () => {
    const existing = {
      permissions: { allow: ["Bash(npm test)"] },
      env: { FOO: "bar" },
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./audit.sh" }] }],
        Stop: [{ hooks: [{ type: "command", command: "./notify.sh" }] }],
      },
    };
    fs.mkdirSync(path.join(dir, ".claude"));
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify(existing));

    applyHooks(dir, ["claude"], hookOptions({ hooks: true }));

    const settings = readJson(dir, ".claude/settings.json");
    expect(settings.permissions).toEqual(existing.permissions);
    expect(settings.env).toEqual(existing.env);
    expect(settings.hooks.PreToolUse).toEqual(existing.hooks.PreToolUse);
    expect(settings.hooks.Stop[0]).toEqual(existing.hooks.Stop[0]);
    expect(settings.hooks.Stop[1].hooks[0].command).toBe(CLAUDE_COMMAND);
    expect(settings.hooks.Stop).toHaveLength(2);
  });

  it("merges into an existing Cursor hooks.json without clobbering other hooks", () => {
    const existing = {
      version: 1,
      hooks: {
        beforeShellExecution: [{ command: ".cursor/hooks/guard.sh" }],
        stop: [{ command: ".cursor/hooks/done.sh" }],
      },
    };
    fs.mkdirSync(path.join(dir, ".cursor"));
    fs.writeFileSync(path.join(dir, ".cursor", "hooks.json"), JSON.stringify(existing));

    applyHooks(dir, ["cursor"], hookOptions({ hooks: true }));

    const config = readJson(dir, ".cursor/hooks.json");
    expect(config.hooks.beforeShellExecution).toEqual(existing.hooks.beforeShellExecution);
    expect(config.hooks.stop[0]).toEqual(existing.hooks.stop[0]);
    expect(config.hooks.stop[1].command).toBe(CURSOR_COMMAND);
    expect(config.hooks.stop).toHaveLength(2);
  });

  it("is idempotent: a second run changes no bytes and adds no duplicate", () => {
    fs.mkdirSync(path.join(dir, ".claude"));
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ model: "opus" }, null, 2));

    applyHooks(dir, ["claude", "cursor"], hookOptions({ hooks: true }));
    const claudeFirst = read(dir, ".claude/settings.json");
    const cursorFirst = read(dir, ".cursor/hooks.json");
    applyHooks(dir, ["claude", "cursor"], hookOptions({ hooks: true }));

    expect(read(dir, ".claude/settings.json")).toBe(claudeFirst);
    expect(read(dir, ".cursor/hooks.json")).toBe(cursorFirst);
    expect(readJson(dir, ".claude/settings.json").hooks.Stop).toHaveLength(1);
  });

  it("updates the command in place when the runner changes", () => {
    applyHooks(dir, ["claude"], hookOptions({ hooks: true }));
    applyHooks(dir, ["claude"], hookOptions({ hooks: true, runner: "pnpm exec vue-doctor" }));

    const stop = readJson(dir, ".claude/settings.json").hooks.Stop;
    expect(stop).toHaveLength(1);
    expect(stop[0].hooks[0].command).toBe("pnpm exec vue-doctor agents hook claude");
  });

  it("uses the local binary when Vue Doctor is a project dependency", () => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ devDependencies: { "@remylagerweij/vue-doctor": "^2.0.0" } }));

    applyHooks(dir, ["claude"], hookOptions({ hooks: true, runner: undefined }));

    expect(readJson(dir, ".claude/settings.json").hooks.Stop[0].hooks[0].command).toBe("npx --no-install vue-doctor agents hook claude");
  });

  it("never overwrites a settings file it cannot parse", () => {
    fs.mkdirSync(path.join(dir, ".claude"));
    const broken = '{ // comment\n "model": "opus", }';
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), broken);

    applyHooks(dir, ["claude"], hookOptions({ hooks: true }));

    expect(read(dir, ".claude/settings.json")).toBe(broken);
  });

  it("writes nothing with --dry-run", () => {
    applyHooks(dir, ["claude", "cursor"], hookOptions({ hooks: true, dryRun: true }));

    expect(fs.existsSync(path.join(dir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".cursor"))).toBe(false);
  });

  it("--remove deletes only the Vue Doctor hook and keeps user settings", () => {
    const existing = { model: "opus", hooks: { Stop: [{ hooks: [{ type: "command", command: "./notify.sh" }] }] } };
    fs.mkdirSync(path.join(dir, ".claude"));
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify(existing));
    applyHooks(dir, ["claude"], hookOptions({ hooks: true }));

    applyHooks(dir, ["claude"], hookOptions({ hooks: true, remove: true }));

    expect(readJson(dir, ".claude/settings.json")).toEqual(existing);
  });

  it("--remove deletes files that only held the Vue Doctor hook", () => {
    applyHooks(dir, ["claude", "cursor"], hookOptions({ hooks: true }));

    applyHooks(dir, ["claude", "cursor"], hookOptions({ hooks: true, remove: true }));

    expect(fs.existsSync(path.join(dir, ".claude", "settings.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".cursor", "hooks.json"))).toBe(false);
  });

  it("--remove on a Cursor file keeps other hooks and user keys", () => {
    const existing = { version: 1, hooks: { stop: [{ command: "./done.sh" }], afterFileEdit: [{ command: "./fmt.sh" }] } };
    fs.mkdirSync(path.join(dir, ".cursor"));
    fs.writeFileSync(path.join(dir, ".cursor", "hooks.json"), JSON.stringify(existing));
    applyHooks(dir, ["cursor"], hookOptions({ hooks: true }));

    applyHooks(dir, ["cursor"], hookOptions({ hooks: true, remove: true }));

    expect(readJson(dir, ".cursor/hooks.json")).toEqual(existing);
  });

  it("recognizes only its own hook commands", () => {
    expect(isVueDoctorHookCommand(CLAUDE_COMMAND)).toBe(true);
    expect(isVueDoctorHookCommand("npx --no-install vue-doctor agents hook cursor")).toBe(true);
    expect(isVueDoctorHookCommand("./hooks/agents hook claude")).toBe(false);
    expect(isVueDoctorHookCommand("vue-doctor . --diff")).toBe(false);
  });

  it("reports unchanged for pure merge/remove helpers when nothing applies", () => {
    expect(removeClaudeHook('{"model":"opus"}')).toEqual({ content: '{"model":"opus"}', changed: false });
    expect(removeCursorHook('{"version":1}')).toEqual({ content: '{"version":1}', changed: false });
    const merged = mergeClaudeHook(null, CLAUDE_COMMAND);
    expect("content" in merged && mergeClaudeHook(merged.content, CLAUDE_COMMAND)).toMatchObject({ changed: false });
    const cursor = mergeCursorHook(null, CURSOR_COMMAND);
    expect("content" in cursor && mergeCursorHook(cursor.content, CURSOR_COMMAND)).toMatchObject({ changed: false });
  });
});

describe("agents install --pre-commit", { timeout: 60_000 }, () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-pre-commit-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const hookPath = () => path.join(dir, ".git", "hooks", "pre-commit");

  it("writes an executable, advisory pre-commit hook", () => {
    initRepo(dir);

    applyHooks(dir, [], hookOptions({ preCommit: true }));

    const script = fs.readFileSync(hookPath(), "utf8");
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain(PRE_COMMIT_MARKER);
    expect(script).toContain(`${RUNNER} . --diff HEAD`);
    expect(script).toContain("|| true");
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
    if (process.platform !== "win32") expect(fs.statSync(hookPath()).mode & 0o111).not.toBe(0);
  });

  it.skipIf(process.platform === "win32")("never fails the commit, whatever the scan does", () => {
    initRepo(dir);
    applyHooks(dir, [], hookOptions({ preCommit: true, runner: "false" }));

    const result = spawnSync("sh", [hookPath()], { cwd: dir, encoding: "utf8" });

    expect(result.status).toBe(0);
  });

  it("is idempotent", () => {
    initRepo(dir);
    applyHooks(dir, [], hookOptions({ preCommit: true }));
    const first = fs.readFileSync(hookPath(), "utf8");
    const mtime = fs.statSync(hookPath()).mtimeMs;

    applyHooks(dir, [], hookOptions({ preCommit: true }));

    expect(fs.readFileSync(hookPath(), "utf8")).toBe(first);
    expect(fs.statSync(hookPath()).mtimeMs).toBe(mtime);
  });

  it("does not touch an existing pre-commit hook", () => {
    initRepo(dir);
    fs.mkdirSync(path.dirname(hookPath()), { recursive: true });
    fs.writeFileSync(hookPath(), "#!/bin/sh\necho mine\n");

    applyHooks(dir, [], hookOptions({ preCommit: true }));

    expect(fs.readFileSync(hookPath(), "utf8")).toBe("#!/bin/sh\necho mine\n");
  });

  it("writes no file for husky, lefthook or simple-git-hooks projects", () => {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ devDependencies: { husky: "^9.0.0" } }));
    applyHooks(dir, [], hookOptions({ preCommit: true }));
    expect(fs.existsSync(hookPath())).toBe(false);

    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    fs.writeFileSync(path.join(dir, "lefthook.yml"), "pre-commit:\n");
    applyHooks(dir, [], hookOptions({ preCommit: true }));
    expect(fs.existsSync(hookPath())).toBe(false);

    fs.rmSync(path.join(dir, "lefthook.yml"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ "simple-git-hooks": { "pre-commit": "npx lint-staged" } }));
    applyHooks(dir, [], hookOptions({ preCommit: true }));
    expect(fs.existsSync(hookPath())).toBe(false);
  });

  it("skips outside a git repository and writes nothing with --dry-run", () => {
    applyHooks(dir, [], hookOptions({ preCommit: true }));
    expect(fs.existsSync(path.join(dir, ".git"))).toBe(false);

    initRepo(dir);
    applyHooks(dir, [], hookOptions({ preCommit: true, dryRun: true }));
    expect(fs.existsSync(hookPath())).toBe(false);
  });

  it("--remove deletes only a hook it wrote", () => {
    initRepo(dir);
    applyHooks(dir, [], hookOptions({ preCommit: true }));
    applyHooks(dir, [], hookOptions({ preCommit: true, remove: true }));
    expect(fs.existsSync(hookPath())).toBe(false);

    fs.mkdirSync(path.dirname(hookPath()), { recursive: true });
    fs.writeFileSync(hookPath(), "#!/bin/sh\necho mine\n");
    applyHooks(dir, [], hookOptions({ preCommit: true, remove: true }));
    expect(fs.existsSync(hookPath())).toBe(true);
  });
});

describe("end-of-turn hook runtime", { timeout: 60_000 }, () => {
  let dir: string;
  let stateDir: string;
  const finding = (line: number, severity = "error") => ({
    ruleId: "vue-doctor/security/no-unsafe-html-sink",
    severity,
    file: "src/App.vue",
    line,
    message: "v-html with dynamic content",
    fingerprint: `fp-${line}`,
  });
  const report = (...findings: ReturnType<typeof finding>[]) => JSON.stringify({ projects: [{ findings }] });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-hook-run-"));
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-hook-state-"));
    initRepo(dir);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
  });
  const touchSource = () => fs.writeFileSync(path.join(dir, "App.vue"), "<template><div /></template>\n");

  it("blocks Claude Code once with the findings as the reason", () => {
    touchSource();
    const output = runAgentHook({ agent: "claude", input: { session_id: "s1", cwd: dir }, cwd: dir, stateDirectory: stateDir, runScan: () => report(finding(3)) });

    const parsed = JSON.parse(output ?? "null");
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toContain("src/App.vue:3 [error] vue-doctor/security/no-unsafe-html-sink");
  });

  it("answers Cursor with a followup_message", () => {
    touchSource();
    const output = runAgentHook({ agent: "cursor", input: { conversation_id: "c1", status: "completed", loop_count: 0, workspace_roots: [dir] }, cwd: "/", stateDirectory: stateDir, runScan: () => report(finding(3)) });

    expect(JSON.parse(output ?? "null").followup_message).toContain("src/App.vue:3");
  });

  it("stays silent when the agent already continued because of a hook (no loop)", () => {
    touchSource();
    const runScan = () => report(finding(3));
    expect(runAgentHook({ agent: "claude", input: { session_id: "s1", cwd: dir, stop_hook_active: true }, cwd: dir, stateDirectory: stateDir, runScan })).toBeNull();
    expect(runAgentHook({ agent: "cursor", input: { conversation_id: "c1", status: "completed", loop_count: 1, workspace_roots: [dir] }, cwd: dir, stateDirectory: stateDir, runScan })).toBeNull();
    expect(runAgentHook({ agent: "cursor", input: { conversation_id: "c1", status: "aborted", loop_count: 0, workspace_roots: [dir] }, cwd: dir, stateDirectory: stateDir, runScan })).toBeNull();
  });

  it("reports the same findings only once per session, but reports new ones", () => {
    touchSource();
    const run = (...findings: ReturnType<typeof finding>[]) =>
      runAgentHook({ agent: "claude", input: { session_id: "s1", cwd: dir }, cwd: dir, stateDirectory: stateDir, runScan: () => report(...findings) });

    expect(run(finding(3))).not.toBeNull();
    expect(run(finding(3))).toBeNull();
    expect(run(finding(3), finding(9, "warning"))).not.toBeNull();
    // A different session starts fresh.
    expect(runAgentHook({ agent: "claude", input: { session_id: "s2", cwd: dir }, cwd: dir, stateDirectory: stateDir, runScan: () => report(finding(3)) })).not.toBeNull();
  });

  it("does not scan when nothing changed or only non-source files changed", () => {
    let scans = 0;
    const runScan = () => {
      scans += 1;
      return report(finding(1));
    };
    const run = () => runAgentHook({ agent: "claude", input: { session_id: "s1", cwd: dir }, cwd: dir, stateDirectory: stateDir, runScan });

    expect(run()).toBeNull();
    fs.writeFileSync(path.join(dir, "notes.txt"), "hi");
    expect(run()).toBeNull();
    expect(scans).toBe(0);
  });

  it("fails open: no findings, a failed scan, bad JSON, a non-git directory or the off switch print nothing", () => {
    touchSource();
    const base = { agent: "claude" as const, input: { session_id: "s1", cwd: dir }, cwd: dir, stateDirectory: stateDir };
    expect(runAgentHook({ ...base, runScan: () => report() })).toBeNull();
    expect(runAgentHook({ ...base, runScan: () => null })).toBeNull();
    expect(runAgentHook({ ...base, runScan: () => "not json" })).toBeNull();
    expect(runAgentHook({ ...base, runScan: () => report(finding(1)), env: { VUE_DOCTOR_AGENT_HOOK: "off" } })).toBeNull();

    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-hook-plain-"));
    try {
      fs.writeFileSync(path.join(plain, "App.vue"), "<template />");
      expect(runAgentHook({ ...base, input: { cwd: plain }, cwd: plain, runScan: () => report(finding(1)) })).toBeNull();
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  it("lists errors first and caps the message at ten findings", () => {
    touchSource();
    const many = Array.from({ length: 12 }, (_, index) => finding(index + 1, index === 11 ? "error" : "warning"));
    const output = runAgentHook({ agent: "claude", input: { session_id: "s1", cwd: dir }, cwd: dir, stateDirectory: stateDir, runScan: () => report(...many) });

    const reason: string = JSON.parse(output ?? "null").reason;
    expect(reason).toContain("found 12 issues");
    expect(reason.indexOf("src/App.vue:12 [error]")).toBeLessThan(reason.indexOf("src/App.vue:1 [warning]"));
    expect(reason).toContain("...and 2 more.");
  });
});

describe("built CLI: agents install --hooks and agents hook", { timeout: 120_000 }, () => {
  const CLI_PATH = path.resolve(import.meta.dirname, "..", "dist", "cli.js");
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoc-agent-cli-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const cli = (args: string[], input?: string) =>
    spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: dir, encoding: "utf8", input: input ?? "", env: { ...process.env, NO_COLOR: "1" } });

  it("installs, re-runs and removes hooks end to end", () => {
    const first = cli(["agents", "install", ".", "--agent", "claude,cursor", "--hooks", "--runner", "vue-doctor"]);
    expect(first.status).toBe(0);
    expect(readJson(dir, ".claude/settings.json").hooks.Stop[0].hooks[0].command).toBe("vue-doctor agents hook claude");
    expect(readJson(dir, ".cursor/hooks.json").hooks.stop[0].command).toBe("vue-doctor agents hook cursor");

    const before = read(dir, ".claude/settings.json");
    expect(cli(["agents", "install", ".", "--agent", "claude,cursor", "--hooks", "--runner", "vue-doctor"]).status).toBe(0);
    expect(read(dir, ".claude/settings.json")).toBe(before);

    expect(cli(["agents", "install", ".", "--agent", "claude,cursor", "--hooks", "--runner", "vue-doctor", "--remove"]).status).toBe(0);
    expect(fs.existsSync(path.join(dir, ".claude", "settings.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".cursor", "hooks.json"))).toBe(false);
  });

  it("the hook command exits 0 with empty stdout when there is nothing to check", () => {
    const claude = cli(["agents", "hook", "claude"], JSON.stringify({ session_id: "s", cwd: dir, stop_hook_active: false }));
    expect(claude.status).toBe(0);
    expect(claude.stdout).toBe("");

    const garbage = cli(["agents", "hook", "cursor"], "not json at all");
    expect(garbage.status).toBe(0);
    expect(garbage.stdout).toBe("");
  });

  it("the hook command blocks once on a real finding in a changed file", () => {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "t", dependencies: { vue: "^3.5.0" } }));
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(
      path.join(dir, "src", "App.vue"),
      '<script setup lang="ts">\nconst html = window.location.hash;\n</script>\n<template>\n  <div v-html="html" />\n</template>\n',
    );
    const input = JSON.stringify({ session_id: "e2e", cwd: dir });
    const env = { ...process.env, NO_COLOR: "1", TMPDIR: dir, TEMP: dir, TMP: dir };
    const run = () => spawnSync(process.execPath, [CLI_PATH, "agents", "hook", "claude"], { cwd: dir, encoding: "utf8", input, env });

    const first = run();
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ decision: "block" });
    expect(JSON.parse(first.stdout).reason).toContain("src/App.vue");

    // Same findings, same session: advisory only, no second block.
    const second = run();
    expect(second.status).toBe(0);
    expect(second.stdout).toBe("");
  });
});
