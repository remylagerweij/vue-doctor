import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { logger } from "../utils/logger.js";
import {
  CLAUDE_SETTINGS_PATH,
  CURSOR_HOOKS_PATH,
  HOOK_AGENTS,
  PRE_COMMIT_MARKER,
  buildHookCommand,
  buildHookManagerSnippet,
  buildPreCommitCommand,
  buildPreCommitScript,
  detectHookManager,
  isEditError,
  mergeClaudeHook,
  mergeCursorHook,
  removeClaudeHook,
  removeCursorHook,
  resolvePreCommitPath,
  resolveRunner,
  type HookAgent,
  type JsonEditResult,
} from "./agent-hooks.js";

export const START_MARKER = "<!-- vue-doctor:start -->";
export const END_MARKER = "<!-- vue-doctor:end -->";

export type AgentTarget = "claude" | "cursor" | "copilot" | "agents-md" | "windsurf" | "antigravity";

const AGENT_INSTRUCTIONS_BLOCK = `${START_MARKER}
## Vue Doctor Agent Instructions

This project uses Vue Doctor (\`@remylagerweij/vue-doctor\`) to enforce code health, security, and performance standards.

- **Diagnostic Scan:** Whenever you modify \`.vue\`, \`.ts\`, \`.js\`, or Nuxt \`server/\` files, run:
  \`\`\`bash
  npx @remylagerweij/vue-doctor@latest . --scope changed --format json
  \`\`\`
- **Fix Priority:** Resolve \`error\` severity and security findings first, followed by correctness and reactivity.
- **Rule Guidance:** If you need remediation advice or examples for any rule, run:
  \`\`\`bash
  npx @remylagerweij/vue-doctor@latest explain <ruleId>
  \`\`\`
- **Autofix:** Apply deterministic fixes automatically where supported:
  \`\`\`bash
  npx @remylagerweij/vue-doctor@latest . --fix
  \`\`\`
- **Discipline:** Do not suppress findings with inline disable comments without an explicit justification comment.
${END_MARKER}`;

const CURSOR_MDC_CONTENT = `---
description: Vue Doctor diagnostic and quality guidelines for Vue and Nuxt
globs: **/*.{vue,ts,js,jsx,tsx}
alwaysApply: true
---

${AGENT_INSTRUCTIONS_BLOCK}
`;

export interface AgentFileInfo {
  target: AgentTarget;
  relativePath: string;
  isDedicated: boolean;
  content: string;
}

export const getTargetFileInfo = (projectDir: string, target: AgentTarget): AgentFileInfo => {
  switch (target) {
    case "claude":
      return {
        target,
        relativePath: path.join(".claude", "skills", "vue-doctor", "SKILL.md"),
        isDedicated: true,
        content: fs.existsSync(path.resolve(projectDir, "skills", "vue-doctor", "SKILL.md"))
          ? fs.readFileSync(path.resolve(projectDir, "skills", "vue-doctor", "SKILL.md"), "utf8")
          : AGENT_INSTRUCTIONS_BLOCK,
      };
    case "cursor":
      return {
        target,
        relativePath: path.join(".cursor", "rules", "vue-doctor.mdc"),
        isDedicated: true,
        content: CURSOR_MDC_CONTENT,
      };
    case "copilot":
      return {
        target,
        relativePath: path.join(".github", "copilot-instructions.md"),
        isDedicated: false,
        content: AGENT_INSTRUCTIONS_BLOCK,
      };
    case "agents-md":
      return {
        target,
        relativePath: "AGENTS.md",
        isDedicated: false,
        content: AGENT_INSTRUCTIONS_BLOCK,
      };
    case "windsurf":
      return {
        target,
        relativePath: path.join(".windsurf", "rules", "vue-doctor.md"),
        isDedicated: true,
        content: AGENT_INSTRUCTIONS_BLOCK,
      };
    case "antigravity":
      return {
        target,
        relativePath: path.join(".agents", "rules", "vue-doctor.md"),
        isDedicated: true,
        content: AGENT_INSTRUCTIONS_BLOCK,
      };
  }
};

/**
 * Inserts or updates the marked block in a multi-purpose file idempotently.
 */
export const updateMarkedContent = (existing: string, newBlock: string): { content: string; changed: boolean } => {
  const startIndex = existing.indexOf(START_MARKER);
  const endIndex = existing.indexOf(END_MARKER);

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    const currentBlock = existing.slice(startIndex, endIndex + END_MARKER.length);
    if (currentBlock === newBlock) {
      return { content: existing, changed: false };
    }
    const before = existing.slice(0, startIndex);
    const after = existing.slice(endIndex + END_MARKER.length);
    const updated = `${before}${newBlock}${after}`;
    return { content: updated, changed: updated !== existing };
  }

  const prefix = existing.trimEnd();
  const updated = prefix.length > 0 ? `${prefix}\n\n${newBlock}\n` : `${newBlock}\n`;
  return { content: updated, changed: updated !== existing };
};

/**
 * Removes the marked block from a multi-purpose file.
 */
export const removeMarkedContent = (existing: string): { content: string; changed: boolean } => {
  const startIndex = existing.indexOf(START_MARKER);
  const endIndex = existing.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return { content: existing, changed: false };
  }

  const before = existing.slice(0, startIndex).trimEnd();
  const after = existing.slice(endIndex + END_MARKER.length).trimStart();
  const updated = [before, after].filter(Boolean).join("\n\n");
  const finalContent = updated.length > 0 ? `${updated}\n` : "";
  return { content: finalContent, changed: finalContent !== existing };
};

export const detectInstalledAgents = (projectDir: string): AgentTarget[] => {
  const detected: AgentTarget[] = [];
  if (fs.existsSync(path.join(projectDir, ".claude"))) detected.push("claude");
  if (fs.existsSync(path.join(projectDir, ".cursor"))) detected.push("cursor");
  if (fs.existsSync(path.join(projectDir, ".github"))) detected.push("copilot");
  if (fs.existsSync(path.join(projectDir, ".windsurf"))) detected.push("windsurf");
  if (fs.existsSync(path.join(projectDir, ".agents"))) detected.push("antigravity");
  if (fs.existsSync(path.join(projectDir, "AGENTS.md")) || detected.length === 0) detected.push("agents-md");
  return detected;
};


export interface HookInstallOptions {
  /** Install end-of-turn hooks for Claude Code and Cursor. */
  hooks: boolean;
  /** Install the advisory git pre-commit hook. */
  preCommit: boolean;
  dryRun: boolean;
  remove: boolean;
  /** Command prefix the hooks run, e.g. `pnpm exec vue-doctor`. Detected from package.json when unset. */
  runner?: string;
}

/** Reads, edits and writes one JSON config file; never overwrites a file it cannot parse. */
const editJsonFile = (
  projectDir: string,
  relativePath: string,
  edit: (existing: string | null) => JsonEditResult,
  options: { dryRun: boolean; remove: boolean },
): void => {
  const fullPath = path.resolve(projectDir, relativePath);
  const exists = fs.existsSync(fullPath);
  if (options.remove && !exists) return;

  const result = edit(exists ? fs.readFileSync(fullPath, "utf8") : null);
  if (isEditError(result)) {
    logger.warn(`Skipped ${relativePath}: ${result.error}.`);
    return;
  }
  if (!result.changed) {
    if (!options.remove) logger.log(`${relativePath} is already up to date.`);
    return;
  }

  const verb = options.remove ? "remove the hook from" : exists ? "update the hook in" : "write the hook to";
  if (options.dryRun) {
    logger.log(`[dry-run] Would ${verb} ${relativePath}`);
    return;
  }
  if (result.content.length === 0) {
    fs.rmSync(fullPath, { force: true });
    logger.success(`Removed empty ${relativePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, result.content, "utf8");
  logger.success(options.remove ? `Removed the Vue Doctor hook from ${relativePath}` : `Wrote the Vue Doctor hook to ${relativePath}`);
};

const installOrRemovePreCommit = (projectDir: string, runner: string, options: HookInstallOptions): void => {
  const hookPath = resolvePreCommitPath(projectDir);
  const display = hookPath ? path.relative(projectDir, hookPath) || hookPath : ".git/hooks/pre-commit";
  const existing = hookPath && fs.existsSync(hookPath) ? fs.readFileSync(hookPath, "utf8") : null;
  const isOurs = existing !== null && existing.includes(PRE_COMMIT_MARKER);

  if (options.remove) {
    if (!hookPath || !isOurs) return;
    if (options.dryRun) {
      logger.log(`[dry-run] Would delete ${display}`);
    } else {
      fs.rmSync(hookPath, { force: true });
      logger.success(`Removed ${display}`);
    }
    return;
  }

  const manager = detectHookManager(projectDir);
  if (manager && !isOurs) {
    logger.log(`${manager} detected: not writing a git hook. ${buildHookManagerSnippet(manager, runner)}`);
    return;
  }
  if (!hookPath) {
    logger.warn("Skipped the pre-commit hook: not a git repository.");
    return;
  }
  if (existing !== null && !isOurs) {
    logger.log(
      `A pre-commit hook already exists at ${display}; leaving it untouched. ` +
        `To run Vue Doctor from it, add: ${buildPreCommitCommand(runner)}`,
    );
    return;
  }

  const script = buildPreCommitScript(runner);
  if (existing === script) {
    logger.log(`${display} is already up to date.`);
    return;
  }
  if (options.dryRun) {
    logger.log(`[dry-run] Would write ${display}`);
    return;
  }
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, script, { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(hookPath, 0o755);
  logger.success(`Wrote ${display} (advisory: prints findings, never blocks a commit)`);
};

/**
 * Installs or removes the optional hooks. The end-of-turn hooks follow the targeted agents
 * (Claude Code and Cursor only); the git pre-commit hook is independent of the agents.
 */
export const applyHooks = (projectDir: string, targets: AgentTarget[], options: HookInstallOptions): void => {
  const runner = options.runner ?? resolveRunner(projectDir);
  const editOptions = { dryRun: options.dryRun, remove: options.remove };

  if (options.hooks) {
    const hookTargets = HOOK_AGENTS.filter((agent): agent is HookAgent => targets.includes(agent));
    if (hookTargets.length === 0) {
      logger.warn("No Claude Code or Cursor target for --hooks; pass --agent claude and/or --agent cursor.");
    }
    for (const agent of hookTargets) {
      const command = buildHookCommand(runner, agent);
      if (agent === "claude") {
        editJsonFile(projectDir, CLAUDE_SETTINGS_PATH, (existing) => (options.remove ? (existing === null ? { content: "", changed: false } : removeClaudeHook(existing)) : mergeClaudeHook(existing, command)), editOptions);
      } else {
        editJsonFile(projectDir, CURSOR_HOOKS_PATH, (existing) => (options.remove ? (existing === null ? { content: "", changed: false } : removeCursorHook(existing)) : mergeCursorHook(existing, command)), editOptions);
      }
    }
  }

  if (options.preCommit) installOrRemovePreCommit(projectDir, runner, options);
};

/** Asks (only in a terminal, never with --yes) whether to add the optional hooks. */
export const promptForHooks = async (): Promise<{ hooks: boolean; preCommit: boolean }> => {
  const { confirm, isCancel } = await import("@clack/prompts");
  const { exitOnCancel } = await import("../utils/prompts.js");
  const ask = async (message: string): Promise<boolean> =>
    Boolean(exitOnCancel(await confirm({ message, initialValue: false, output: process.stderr, withGuide: false }), isCancel));
  const hooks = await ask("Add end-of-turn hooks so Claude Code and Cursor check the files they changed?");
  const preCommit = await ask("Add an advisory git pre-commit hook (prints findings, never blocks the commit)?");
  return { hooks, preCommit };
};

export const registerAgentsCommand = (program: Command): void => {
  const agents = program
    .command("agents")
    .description("Manage AI agent instructions and tool configurations");

  agents
    .command("install")
    .description("Install Vue Doctor playbook instructions for AI coding agents")
    .argument("[directory]", "Project directory", ".")
    .option("--agent <agents>", "Comma-separated list of target agents (claude, cursor, copilot, agents-md, windsurf, antigravity)")
    .option("--dry-run", "Show what would be installed or modified without writing files", false)
    .option("--remove", "Remove Vue Doctor agent instructions (and, with --hooks / --pre-commit, those hooks) from targets", false)
    .option("--hooks", "Also install end-of-turn hooks for Claude Code (.claude/settings.json) and Cursor (.cursor/hooks.json)", false)
    .option("--pre-commit", "Also install an advisory git pre-commit hook (only when none exists; prints a snippet for husky, lefthook and simple-git-hooks)", false)
    .option("--runner <command>", "Command prefix the hooks run, e.g. \"pnpm exec vue-doctor\" (default: detected from package.json)")
    .option("-y, --yes", "Skip interactive prompts", false)
    .action(async (directoryArg: string, options: { agent?: string; dryRun?: boolean; remove?: boolean; hooks?: boolean; preCommit?: boolean; runner?: string; yes?: boolean }) => {
      const projectDir = path.resolve(directoryArg);

      let targetAgents: AgentTarget[];
      if (options.agent) {
        targetAgents = options.agent.split(",").map((a) => a.trim().toLowerCase()) as AgentTarget[];
      } else {
        targetAgents = detectInstalledAgents(projectDir);
      }

      logger.log(`Targeting agents: ${targetAgents.join(", ")}`);

      for (const target of targetAgents) {
        const fileInfo = getTargetFileInfo(projectDir, target);
        const fullPath = path.resolve(projectDir, fileInfo.relativePath);

        if (options.remove) {
          if (!fs.existsSync(fullPath)) {
            continue;
          }

          if (fileInfo.isDedicated) {
            if (options.dryRun) {
              logger.log(`[dry-run] Would delete ${fileInfo.relativePath}`);
            } else {
              fs.rmSync(fullPath, { force: true });
              logger.success(`Removed ${fileInfo.relativePath}`);
            }
          } else {
            const current = fs.readFileSync(fullPath, "utf8");
            const { content: updated, changed } = removeMarkedContent(current);
            if (changed) {
              if (options.dryRun) {
                logger.log(`[dry-run] Would remove block from ${fileInfo.relativePath}`);
              } else {
                if (updated.length === 0) {
                  fs.rmSync(fullPath, { force: true });
                  logger.success(`Removed empty ${fileInfo.relativePath}`);
                } else {
                  fs.writeFileSync(fullPath, updated, "utf8");
                  logger.success(`Removed Vue Doctor instructions from ${fileInfo.relativePath}`);
                }
              }
            }
          }
        } else {
          // Install / Update
          if (fileInfo.isDedicated) {
            const exists = fs.existsSync(fullPath);
            const current = exists ? fs.readFileSync(fullPath, "utf8") : "";
            if (current === fileInfo.content) {
              logger.log(`${fileInfo.relativePath} is already up to date.`);
              continue;
            }

            if (options.dryRun) {
              logger.log(`[dry-run] Would write ${fileInfo.relativePath}`);
            } else {
              fs.mkdirSync(path.dirname(fullPath), { recursive: true });
              fs.writeFileSync(fullPath, fileInfo.content, "utf8");
              logger.success(`Wrote ${fileInfo.relativePath}`);
            }
          } else {
            const exists = fs.existsSync(fullPath);
            const current = exists ? fs.readFileSync(fullPath, "utf8") : "";
            const { content: updated, changed } = updateMarkedContent(current, fileInfo.content);

            if (!changed) {
              logger.log(`${fileInfo.relativePath} is already up to date.`);
              continue;
            }

            if (options.dryRun) {
              logger.log(`[dry-run] Would update block in ${fileInfo.relativePath}`);
            } else {
              fs.mkdirSync(path.dirname(fullPath), { recursive: true });
              fs.writeFileSync(fullPath, updated, "utf8");
              logger.success(`Updated Vue Doctor block in ${fileInfo.relativePath}`);
            }
          }
        }
      }

      let installHooks = Boolean(options.hooks);
      let installPreCommit = Boolean(options.preCommit);
      const canPrompt = Boolean(process.stdin.isTTY) && !options.yes && !options.dryRun && !options.remove;
      if (canPrompt && !installHooks && !installPreCommit) {
        const answers = await promptForHooks();
        installHooks = answers.hooks;
        installPreCommit = answers.preCommit;
      }
      if (installHooks || installPreCommit) {
        applyHooks(projectDir, targetAgents, {
          hooks: installHooks,
          preCommit: installPreCommit,
          dryRun: Boolean(options.dryRun),
          remove: Boolean(options.remove),
          runner: options.runner,
        });
      }
    });

  // Invoked by the installed hooks, not by people: reads the agent's event JSON on stdin and
  // prints the agent's expected response on stdout. See agent-hook-run.ts for the safety contract.
  agents
    .command("hook", { hidden: true })
    .description("Run the end-of-turn check for an AI coding agent (called by the installed hooks)")
    .argument("<agent>", "claude or cursor")
    .action(async (agent: string) => {
      if (!(HOOK_AGENTS as readonly string[]).includes(agent)) {
        logger.error(`Unknown hook agent "${agent}". Use claude or cursor.`);
        process.exitCode = 2;
        return;
      }
      const { readHookInput, runAgentHook } = await import("./agent-hook-run.js");
      const input = await readHookInput();
      const output = runAgentHook({ agent: agent as HookAgent, input, cwd: process.cwd() });
      if (output) process.stdout.write(`${output}\n`);
      process.exitCode = 0;
    });
};
