import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { logger } from "../utils/logger.js";
import { renderMainWorkflow } from "../ci/workflow-generator.js";
import {
  detectInstalledAgents,
  getTargetFileInfo,
  updateMarkedContent,
  type AgentTarget,
} from "./agents.js";

export interface InitConfigOptions {
  failOn: "error" | "warning" | "none";
  minScore?: number;
  scope: "new" | "all";
  deadCode: boolean;
  audit: boolean;
  baseline?: string;
}

export const renderConfigFile = (options: InitConfigOptions): string => {
  const lines: string[] = [
    'import { defineConfig } from "@remylagerweij/vue-doctor";',
    "",
    "export default defineConfig({",
    "  gate: {",
    `    failOn: "${options.failOn}",`,
  ];

  if (typeof options.minScore === "number" && options.minScore > 0) {
    lines.push(`    minScore: ${options.minScore},`);
  }

  lines.push(
    `    scope: "${options.scope}",`,
    "  },",
    "  lint: true,",
    `  deadCode: ${options.deadCode},`,
  );

  if (options.audit) {
    lines.push(
      "  audit: {",
      "    enabled: true,",
      "  },",
    );
  }

  if (options.baseline) {
    lines.push(`  baseline: "${options.baseline}",`);
  }

  lines.push("});", "");
  return lines.join("\n");
};

export const addScriptsToPackageJson = (projectDir: string): boolean => {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;

  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    pkg.scripts = pkg.scripts || {};

    let modified = false;
    if (!pkg.scripts.doctor) {
      pkg.scripts.doctor = "vue-doctor";
      modified = true;
    }
    if (!pkg.scripts["doctor:fix"]) {
      pkg.scripts["doctor:fix"] = "vue-doctor --fix";
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const installAgentPlaybooks = (projectDir: string, targets: AgentTarget[]): void => {
  for (const target of targets) {
    const fileInfo = getTargetFileInfo(projectDir, target);
    const fullPath = path.resolve(projectDir, fileInfo.relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    if (fileInfo.isDedicated) {
      fs.writeFileSync(fullPath, fileInfo.content, "utf8");
    } else {
      const existing = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
      const { content } = updateMarkedContent(existing, fileInfo.content);
      fs.writeFileSync(fullPath, content, "utf8");
    }
  }
};

export const registerInitCommand = (program: Command): void => {
  program
    .command("init")
    .description("Interactive setup wizard to configure Vue Doctor, CI workflow, and agent instructions")
    .argument("[directory]", "Project directory", ".")
    .option("-y, --yes", "Skip interactive prompts and install defaults", false)
    .option("-f, --force", "Overwrite existing configuration", false)
    .action(async (directoryArg: string, options: { yes?: boolean; force?: boolean }) => {
      const projectDir = path.resolve(directoryArg);
      const isInteractive = Boolean(process.stdin.isTTY) && !options.yes;
      const clack = isInteractive ? await import("@clack/prompts") : null;

      // Project Discovery
      const { discoverProject, formatFrameworkName } = await import("../utils/discover-project.js");
      const { isMonorepoRoot } = await import("../utils/find-monorepo-root.js");
      const projectInfo = discoverProject(projectDir);

      if (isInteractive && clack) {
        clack.intro("🩺 Vue Doctor Setup Wizard");

        const frameworkLabel = formatFrameworkName(projectInfo.framework);
        const details = [
          frameworkLabel,
          projectInfo.vueVersion ? `Vue ${projectInfo.vueVersion}` : null,
          projectInfo.hasTypeScript ? "TypeScript" : null,
          isMonorepoRoot(projectDir) ? "Monorepo" : null,
        ].filter(Boolean).join(" · ");

        clack.note(details || "Vue project detected", "Project Detection");
      }

      // 1. Quality Gate Configuration
      let failOn: "error" | "warning" | "none" = "error";
      let minScore = 80;
      let scope: "new" | "all" = "new";

      if (isInteractive && clack) {
        const gatePreset = await clack.select({
          message: "What quality gate policy would you like in CI?",
          options: [
            {
              value: "strict",
              label: "Strict (Recommended)",
              hint: "Fail CI on errors or if score < 80",
            },
            {
              value: "standard",
              label: "Standard",
              hint: "Fail CI on errors only (no min score)",
            },
            {
              value: "advisory",
              label: "Advisory only",
              hint: "Never fail CI, report diagnostics only",
            },
          ],
          initialValue: "strict",
        });

        if (clack.isCancel(gatePreset)) {
          clack.cancel("Setup cancelled.");
          return;
        }

        if (gatePreset === "strict") {
          failOn = "error";
          minScore = 80;
          scope = "new";
        } else if (gatePreset === "standard") {
          failOn = "error";
          minScore = 0;
          scope = "new";
        } else {
          failOn = "none";
          minScore = 0;
          scope = "all";
        }
      }

      // 2. Feature Toggles (Dead Code & Audit)
      let enableDeadCode = true;
      let enableAudit = false;

      if (isInteractive && clack) {
        const deadCodeChoice = await clack.confirm({
          message: "Enable dead code & unused exports detection (via Knip)?",
          initialValue: true,
        });
        if (clack.isCancel(deadCodeChoice)) {
          clack.cancel("Setup cancelled.");
          return;
        }
        enableDeadCode = Boolean(deadCodeChoice);

        const auditChoice = await clack.confirm({
          message: "Enable dependency vulnerability auditing against OSV.dev (--audit)?",
          initialValue: false,
        });
        if (clack.isCancel(auditChoice)) {
          clack.cancel("Setup cancelled.");
          return;
        }
        enableAudit = Boolean(auditChoice);
      }

      // 3. Baseline Selection
      let createBaselineSnapshot = false;
      const baselineFileName = "vue-doctor-baseline.json";

      if (isInteractive && clack) {
        const baselineChoice = await clack.confirm({
          message: "Grandfather in existing findings with a baseline (so CI only checks newly introduced code)?",
          initialValue: true,
        });
        if (clack.isCancel(baselineChoice)) {
          clack.cancel("Setup cancelled.");
          return;
        }
        createBaselineSnapshot = Boolean(baselineChoice);
      }

      // 4. Config File Creation
      const configExt = projectInfo.hasTypeScript ? "ts" : "js";
      const configFileName = `vue-doctor.config.${configExt}`;
      const configPath = path.join(projectDir, configFileName);

      let shouldWriteConfig = true;
      if (fs.existsSync(configPath) && !options.force) {
        if (isInteractive && clack) {
          const overwriteConfig = await clack.confirm({
            message: `${configFileName} already exists. Overwrite?`,
            initialValue: false,
          });
          if (clack.isCancel(overwriteConfig)) {
            clack.cancel("Setup cancelled.");
            return;
          }
          shouldWriteConfig = Boolean(overwriteConfig);
        } else {
          shouldWriteConfig = false;
        }
      }

      if (shouldWriteConfig) {
        const configContent = renderConfigFile({
          failOn,
          minScore,
          scope,
          deadCode: enableDeadCode,
          audit: enableAudit,
          baseline: createBaselineSnapshot ? baselineFileName : undefined,
        });
        fs.writeFileSync(configPath, configContent, "utf8");
        if (isInteractive && clack) clack.log.success(`Created ${configFileName}`);
        else logger.success(`Created ${configFileName}`);
      } else {
        if (isInteractive && clack) clack.log.info(`Kept existing ${configFileName}`);
        else logger.log(`Kept existing ${configFileName}`);
      }

      // 5. Add scripts to package.json
      let shouldAddScripts = true;
      if (isInteractive && clack) {
        const scriptsChoice = await clack.confirm({
          message: 'Add "doctor" and "doctor:fix" to package.json scripts?',
          initialValue: true,
        });
        if (clack.isCancel(scriptsChoice)) {
          clack.cancel("Setup cancelled.");
          return;
        }
        shouldAddScripts = Boolean(scriptsChoice);
      }

      if (shouldAddScripts) {
        const scriptsAdded = addScriptsToPackageJson(projectDir);
        if (scriptsAdded) {
          if (isInteractive && clack) clack.log.success('Added "doctor" and "doctor:fix" to package.json scripts');
          else logger.success('Added "doctor" and "doctor:fix" to package.json scripts');
        }
      }

      // 6. CI Workflow Setup
      let shouldInstallCi = options.yes ?? true;
      if (isInteractive && clack) {
        const installCiChoice = await clack.confirm({
          message: "Set up automated GitHub Actions workflow (.github/workflows/vue-doctor.yml)?",
          initialValue: true,
        });
        if (clack.isCancel(installCiChoice)) {
          clack.cancel("Setup cancelled.");
          return;
        }
        shouldInstallCi = Boolean(installCiChoice);
      }

      if (shouldInstallCi) {
        const workflowsDir = path.join(projectDir, ".github", "workflows");
        fs.mkdirSync(workflowsDir, { recursive: true });
        const wfPath = path.join(workflowsDir, "vue-doctor.yml");
        if (!fs.existsSync(wfPath) || options.force) {
          fs.writeFileSync(wfPath, renderMainWorkflow({ failOn, audit: enableAudit }), "utf8");
          if (isInteractive && clack) clack.log.success("Created .github/workflows/vue-doctor.yml");
          else logger.success(`Created ${wfPath}`);
        } else {
          if (isInteractive && clack) clack.log.info(".github/workflows/vue-doctor.yml already exists");
        }
      }

      // 7. AI Agent Playbooks Setup
      const detectedAgents = detectInstalledAgents(projectDir);
      let shouldInstallAgents = options.yes ?? false;

      if (isInteractive && clack && detectedAgents.length > 0) {
        const agentsChoice = await clack.confirm({
          message: `Install AI agent playbooks for detected tools (${detectedAgents.join(", ")})?`,
          initialValue: true,
        });
        if (clack.isCancel(agentsChoice)) {
          clack.cancel("Setup cancelled.");
          return;
        }
        shouldInstallAgents = Boolean(agentsChoice);
      }

      if (shouldInstallAgents && detectedAgents.length > 0) {
        installAgentPlaybooks(projectDir, detectedAgents);
        if (isInteractive && clack) clack.log.success(`Installed AI agent instructions for ${detectedAgents.join(", ")}`);
        else logger.success(`Installed AI agent instructions for ${detectedAgents.join(", ")}`);
      }

      // 8. Baseline Snapshot Generation
      if (createBaselineSnapshot) {
        const spinner = isInteractive && clack ? clack.spinner() : null;
        if (spinner) spinner.start("Scanning project to record baseline snapshot...");
        else logger.log("Scanning project to record baseline snapshot...");

        try {
          const { diagnose } = await import("../core/diagnose.js");
          const { createBaseline, writeBaseline } = await import("../core/baseline.js");

          const scanResult = await diagnose(projectDir, { baseline: null });
          const baselineData = createBaseline(scanResult.diagnostics);
          const baselineFilePath = path.join(projectDir, baselineFileName);
          writeBaseline(baselineFilePath, baselineData);

          const countMsg = `${baselineData.findings.length} finding${baselineData.findings.length === 1 ? "" : "s"}`;
          if (spinner) spinner.stop(`Created ${baselineFileName} (${countMsg} recorded)`);
          else logger.success(`Created ${baselineFileName} (${countMsg} recorded)`);
        } catch (err: any) {
          if (spinner) spinner.stop("Failed to record baseline snapshot");
          logger.warn(`Could not create initial baseline: ${err.message}`);
        }
      }

      // Done!
      if (isInteractive && clack) {
        clack.outro("🎉 Vue Doctor is set up and ready! Run `npm run doctor` to diagnose your project.");
      } else {
        logger.success("Vue Doctor setup completed.");
      }
    });
};
