import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { VERSION } from "../constants.js";

/**
 * Installers for the optional `agents install --hooks` / `--pre-commit` features. Everything
 * here is plain `fs` and string handling (no heavyweight imports), so the `agents` command stays
 * cheap to load. Hook configuration formats were checked against the official docs:
 * - Claude Code: `hooks.Stop[].hooks[]` in `.claude/settings.json` (`type`, `command`, `timeout` in seconds).
 * - Cursor: `.cursor/hooks.json` with `version: 1` and `hooks.stop[]` (`command`, `timeout` in seconds, `loop_limit`).
 */

export type HookAgent = "claude" | "cursor";
export const HOOK_AGENTS: readonly HookAgent[] = ["claude", "cursor"];

export const PRE_COMMIT_MARKER = "# vue-doctor:pre-commit";

const PACKAGE_NAME = "@remylagerweij/vue-doctor";
/** Seconds the agent waits for the hook; the hook itself gives up earlier (see agent-hook-run.ts). */
export const HOOK_TIMEOUT_SECONDS = 60;
const HOOK_STATUS_MESSAGE = "Vue Doctor: checking changed files";

export const CLAUDE_SETTINGS_PATH = path.join(".claude", "settings.json");
export const CURSOR_HOOKS_PATH = path.join(".cursor", "hooks.json");

export interface EditResult {
  content: string;
  changed: boolean;
}

export type JsonEditResult = EditResult | { error: string };

export const isEditError = (result: JsonEditResult): result is { error: string } => "error" in result;

/**
 * The command prefix used by installed hooks. A project that has Vue Doctor as a dependency runs
 * its local binary (no network, fast); otherwise npx runs the package pinned to the version that
 * installed the hook, so a later release cannot change hook behaviour unannounced. npx may still
 * need the network once to fetch it; adding Vue Doctor as a devDependency avoids that.
 */
export const resolveRunner = (projectDir: string): string => {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (manifest.dependencies?.[PACKAGE_NAME] || manifest.devDependencies?.[PACKAGE_NAME]) {
      return "npx --no-install vue-doctor";
    }
  } catch {
    // No or unreadable package.json: fall through to the published package.
  }
  return `npx --yes ${PACKAGE_NAME}@${VERSION}`;
};

export const buildHookCommand = (runner: string, agent: HookAgent): string => `${runner} agents hook ${agent}`;

/** True for a command this feature wrote (also after the runner was changed). */
export const isVueDoctorHookCommand = (command: unknown): boolean =>
  typeof command === "string" && /\bagents hook (claude|cursor)\b/.test(command);

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonObject = (existing: string | null): { value: JsonObject } | { error: string } => {
  if (existing === null || existing.trim().length === 0) return { value: {} };
  try {
    const parsed: unknown = JSON.parse(existing);
    if (!isObject(parsed)) return { error: "it is not a JSON object" };
    return { value: parsed };
  } catch {
    return { error: "it is not valid JSON (comments are not supported); left unmodified" };
  }
};

const serialize = (value: JsonObject): string => `${JSON.stringify(value, null, 2)}\n`;

const sameJson = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/**
 * Claude Code: adds (or updates in place) one `Stop` command hook, keeping every other key,
 * event and handler. Idempotent: an identical existing entry reports `changed: false`.
 */
export const mergeClaudeHook = (existing: string | null, command: string): JsonEditResult => {
  const parsed = parseJsonObject(existing);
  if ("error" in parsed) return parsed;
  const settings = parsed.value;

  if (settings.hooks !== undefined && !isObject(settings.hooks)) return { error: `"hooks" is not an object` };
  const hooks: JsonObject = isObject(settings.hooks) ? settings.hooks : {};
  if (hooks.Stop !== undefined && !Array.isArray(hooks.Stop)) return { error: `"hooks.Stop" is not an array` };
  const stopGroups: unknown[] = Array.isArray(hooks.Stop) ? [...hooks.Stop] : [];

  const desired = {
    type: "command",
    command,
    timeout: HOOK_TIMEOUT_SECONDS,
    statusMessage: HOOK_STATUS_MESSAGE,
  };

  let found = false;
  const nextGroups = stopGroups.map((group) => {
    if (!isObject(group) || !Array.isArray(group.hooks)) return group;
    const nextHandlers = group.hooks.flatMap((handler: unknown) => {
      if (!isObject(handler) || !isVueDoctorHookCommand(handler.command)) return [handler];
      if (found) return []; // a duplicate from an earlier edit
      found = true;
      return [desired];
    });
    return { ...group, hooks: nextHandlers };
  });
  if (!found) nextGroups.push({ hooks: [desired] });

  const next: JsonObject = { ...settings, hooks: { ...hooks, Stop: nextGroups } };
  const content = serialize(next);
  return { content, changed: !sameJson(next, settings) };
};

/** Claude Code: removes only this feature's `Stop` handler and prunes anything it leaves empty. */
export const removeClaudeHook = (existing: string): JsonEditResult => {
  const parsed = parseJsonObject(existing);
  if ("error" in parsed) return parsed;
  const settings = parsed.value;
  if (!isObject(settings.hooks) || !Array.isArray(settings.hooks.Stop)) return { content: existing, changed: false };

  let removed = false;
  const nextGroups = settings.hooks.Stop.flatMap((group: unknown) => {
    if (!isObject(group) || !Array.isArray(group.hooks)) return [group];
    const handlers = group.hooks.filter((handler: unknown) => {
      const ours = isObject(handler) && isVueDoctorHookCommand(handler.command);
      if (ours) removed = true;
      return !ours;
    });
    return handlers.length === 0 ? [] : [{ ...group, hooks: handlers }];
  });
  if (!removed) return { content: existing, changed: false };

  const { Stop: _stop, ...otherEvents } = settings.hooks;
  const nextHooks: JsonObject = nextGroups.length > 0 ? { ...otherEvents, Stop: nextGroups } : otherEvents;
  const { hooks: _hooks, ...otherSettings } = settings;
  const next: JsonObject = Object.keys(nextHooks).length > 0 ? { ...otherSettings, hooks: nextHooks } : otherSettings;
  return { content: Object.keys(next).length === 0 ? "" : serialize(next), changed: true };
};

/**
 * Cursor: adds (or updates in place) one `stop` hook. `loop_limit: 1` lets Cursor auto-submit
 * the follow-up message at most once per conversation turn, on top of the hook's own guard.
 */
export const mergeCursorHook = (existing: string | null, command: string): JsonEditResult => {
  const parsed = parseJsonObject(existing);
  if ("error" in parsed) return parsed;
  const config = parsed.value;

  if (config.hooks !== undefined && !isObject(config.hooks)) return { error: `"hooks" is not an object` };
  const hooks: JsonObject = isObject(config.hooks) ? config.hooks : {};
  if (hooks.stop !== undefined && !Array.isArray(hooks.stop)) return { error: `"hooks.stop" is not an array` };
  const stopHooks: unknown[] = Array.isArray(hooks.stop) ? hooks.stop : [];

  const desired = { command, timeout: HOOK_TIMEOUT_SECONDS, loop_limit: 1 };
  let found = false;
  const nextStop = stopHooks.flatMap((hook) => {
    if (!isObject(hook) || !isVueDoctorHookCommand(hook.command)) return [hook];
    if (found) return [];
    found = true;
    return [desired];
  });
  if (!found) nextStop.push(desired);

  const next: JsonObject = {
    ...(config.version === undefined ? { version: 1 } : {}),
    ...config,
    hooks: { ...hooks, stop: nextStop },
  };
  return { content: serialize(next), changed: !sameJson(next, config) };
};

/** Cursor: removes only this feature's `stop` hook and prunes anything it leaves empty. */
export const removeCursorHook = (existing: string): JsonEditResult => {
  const parsed = parseJsonObject(existing);
  if ("error" in parsed) return parsed;
  const config = parsed.value;
  if (!isObject(config.hooks) || !Array.isArray(config.hooks.stop)) return { content: existing, changed: false };

  const nextStop = config.hooks.stop.filter((hook: unknown) => !(isObject(hook) && isVueDoctorHookCommand(hook.command)));
  if (nextStop.length === config.hooks.stop.length) return { content: existing, changed: false };

  const { stop: _stop, ...otherEvents } = config.hooks;
  const nextHooks: JsonObject = nextStop.length > 0 ? { ...otherEvents, stop: nextStop } : otherEvents;
  const next: JsonObject = { ...config, hooks: nextHooks };
  // Only the `version` key (which we may have added) left: nothing of the user's remains.
  const onlyVersion = Object.keys(next).every((key) => key === "version" || (key === "hooks" && Object.keys(nextHooks).length === 0));
  return { content: onlyVersion ? "" : serialize(next), changed: true };
};

// --- Git pre-commit hook -----------------------------------------------------------------

export type HookManager = "husky" | "lefthook" | "simple-git-hooks";

/** Looks for a git hook manager. Their hooks are managed by config, so we print a snippet instead of writing. */
export const detectHookManager = (projectDir: string): HookManager | null => {
  const has = (...names: string[]): boolean => names.some((name) => fs.existsSync(path.join(projectDir, name)));
  let manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; [key: string]: unknown } = {};
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  } catch {
    // No package.json.
  }
  const dependsOn = (name: string): boolean => Boolean(manifest.dependencies?.[name] || manifest.devDependencies?.[name]);

  if (has(".husky") || dependsOn("husky")) return "husky";
  if (has("lefthook.yml", "lefthook.yaml", "lefthook.json", ".lefthook.yml", ".lefthook.yaml", ".lefthook.json") || dependsOn("lefthook")) return "lefthook";
  if (has(".simple-git-hooks.json", ".simple-git-hooks.cjs", "simple-git-hooks.js") || dependsOn("simple-git-hooks") || manifest["simple-git-hooks"] !== undefined) {
    return "simple-git-hooks";
  }
  return null;
};

const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

/**
 * The advisory scan command: prints findings for changed files and never fails (`|| true`).
 * Git runs hooks from the top of the repository, so a project in a subdirectory (`relativeDir`,
 * relative to that top level) is entered first; the runner is then resolved from the project.
 */
export const buildPreCommitCommand = (runner: string, relativeDir = ""): string => {
  const scan = `${runner} . --diff HEAD --no-dead-code --offline --quiet --fail-on none`;
  return relativeDir ? `(cd ${shellQuote(relativeDir)} && ${scan}) || true` : `${scan} || true`;
};

export const buildPreCommitScript = (runner: string, relativeDir = ""): string => `#!/bin/sh
${PRE_COMMIT_MARKER} (advisory: prints findings, never blocks the commit)
# Installed by \`vue-doctor agents install --pre-commit\`. Remove with \`agents install --remove --pre-commit\`.
# Set VUE_DOCTOR_PRECOMMIT=off to skip it for a single commit.
[ "\${VUE_DOCTOR_PRECOMMIT:-}" = "off" ] && exit 0
# Nothing to compare against before the first commit.
git rev-parse --verify --quiet HEAD >/dev/null 2>&1 || exit 0
${buildPreCommitCommand(runner, relativeDir)}
exit 0
`;

export const buildHookManagerSnippet = (manager: HookManager, runner: string, relativeDir = ""): string => {
  const command = buildPreCommitCommand(runner, relativeDir);
  switch (manager) {
    case "husky":
      return `Add this line to .husky/pre-commit:\n\n  ${command}`;
    case "lefthook":
      return `Add this to lefthook.yml:\n\n  pre-commit:\n    commands:\n      vue-doctor:\n        run: ${command}`;
    case "simple-git-hooks":
      return `Add this to the "simple-git-hooks" entry in package.json (then run \`npx simple-git-hooks\`):\n\n  "pre-commit": ${JSON.stringify(command)}`;
  }
};

/** Path of the git `pre-commit` hook (honours core.hooksPath and worktrees), or null outside a git repository. */
export const resolvePreCommitPath = (projectDir: string): string | null => {
  const result = spawnSync("git", ["rev-parse", "--git-path", "hooks/pre-commit"], {
    cwd: projectDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error || result.status !== 0) return null;
  const output = result.stdout.trim();
  return output.length > 0 ? path.resolve(projectDir, output) : null;
};

/** The project directory relative to the git top level ("" when it is the top level or not in git). */
export const resolveRelativeToGitRoot = (projectDir: string): string => {
  const result = spawnSync("git", ["rev-parse", "--show-prefix"], { cwd: projectDir, encoding: "utf8", stdio: "pipe" });
  if (result.error || result.status !== 0) return "";
  return result.stdout.trim().replace(/\/+$/, "");
};
