import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { logger } from "../utils/logger.js";

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
    .option("--remove", "Remove Vue Doctor agent instructions from targets", false)
    .action(async (directoryArg: string, options: { agent?: string; dryRun?: boolean; remove?: boolean }) => {
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
    });
};
