# AI Agents & IDE Integration

Vue Doctor is designed for seamless collaboration with AI coding assistants (Claude Code, Cursor, GitHub Copilot, Windsurf, Antigravity, etc.).

---

## 1. Automatic Agent Setup

Install Vue Doctor instructions for all detected coding agents with a single command:

```bash
npx @remylagerweij/vue-doctor@latest agents install
```

### Supported Targets

| Agent / Tool | File Managed |
|---|---|
| **Claude Code** | `.claude/skills/vue-doctor/SKILL.md` |
| **Cursor** | `.cursor/rules/vue-doctor.mdc` |
| **GitHub Copilot** | Block in `.github/copilot-instructions.md` |
| **Generic / Codex** | Block in `AGENTS.md` |
| **Windsurf** | `.windsurf/rules/vue-doctor.md` |
| **Antigravity** | `.agents/rules/vue-doctor.md` |

### Targeting Specific Agents

To install instructions only for specific agents:

```bash
npx @remylagerweij/vue-doctor@latest agents install --agent claude,cursor
```

---

## 2. Optional Hooks

Instructions rely on the agent remembering to scan. Hooks make it automatic. Both are opt-in and
never installed by default.

### End-of-turn hooks (Claude Code and Cursor)

```bash
npx @remylagerweij/vue-doctor@latest agents install --agent claude,cursor --hooks
```

| Agent | File | Event |
|---|---|---|
| **Claude Code** | `.claude/settings.json` | `Stop` command hook (`hooks.Stop`) |
| **Cursor** | `.cursor/hooks.json` | `stop` hook (`hooks.stop`, with `loop_limit: 1`) |

When the agent is about to finish a turn, the hook scans **only the files changed since `HEAD`**
(the working tree against `HEAD`: uncommitted and untracked source files, including edits made before the session; no dead-code analysis, no network from the scan itself) and, if it finds
issues, hands them back to the agent so it can fix them before it stops:

- Claude Code receives `{"decision": "block", "reason": "..."}` listing up to ten findings.
- Cursor receives `{"followup_message": "..."}` with the same list.

The hook is built so it cannot trap the agent:

- **At most one continuation per turn.** It stays silent when Claude Code reports `stop_hook_active`
  or Cursor reports a `loop_count` of 1 or more.
- **The same findings are reported once per session.** An agent that stops again without changing the
  findings is not nagged.
- **Fast and fail-open.** No changed source files means no scan; the scan is killed after 45 seconds;
  any error (no git repository, scan failure, unreadable input) prints nothing and exits `0`.
- Set `VUE_DOCTOR_AGENT_HOOK=off` to disable the hooks without editing any file.

Existing settings are merged, never replaced: other keys, events and hooks stay untouched, a file that is
not valid JSON is left as it is, and re-running the command changes nothing. Vue Doctor's own entry (recognised by its `agents hook <agent>` command, whatever the runner) is
updated in place if the command changes.

The hook command is `npx --no-install vue-doctor agents hook <agent>` when Vue Doctor is a dependency of
the project and `npx --yes @remylagerweij/vue-doctor@<installed version> agents hook <agent>` otherwise (pinned, so a new release never changes the hook unannounced; npx may need the network once to fetch it, so adding Vue Doctor as a devDependency is recommended). Use
`--runner "pnpm exec vue-doctor"` to choose the command prefix yourself.

### Advisory git pre-commit hook

```bash
npx @remylagerweij/vue-doctor@latest agents install --pre-commit
```

Writes a `pre-commit` hook that prints findings for uncommitted and untracked source files (the working tree against `HEAD`, not only what is staged) and **never fails the
commit** (it always exits `0`; set `VUE_DOCTOR_PRECOMMIT=off` to skip it once).

- It is only written when no `pre-commit` hook exists. An existing hook is never modified.
- When **husky**, **lefthook** or **simple-git-hooks** is detected, no file is written; the command prints
  the snippet to add to that tool's configuration instead.
- It honours `core.hooksPath` and git worktrees. When the project is in a subdirectory of the repository, the hook runs `cd <subdirectory>` first, because git runs hooks from the repository top level.

In a terminal, `agents install` asks whether to add the hooks when you pass neither flag (skip the
questions with `--yes`).

---

## 3. Dry Run & Removal

Preview changes without modifying the filesystem:

```bash
npx @remylagerweij/vue-doctor@latest agents install --dry-run
```

Remove all installed agent instruction blocks:

```bash
npx @remylagerweij/vue-doctor@latest agents install --remove
```

Add `--hooks` and/or `--pre-commit` to also remove those hooks. Only Vue Doctor's own entries are
removed: other keys and hooks in `.claude/settings.json` and `.cursor/hooks.json` stay, a settings file
left empty is deleted, and a pre-commit hook that Vue Doctor did not write is never touched.

```bash
npx @remylagerweij/vue-doctor@latest agents install --remove --hooks --pre-commit
```

---

## 4. The Agent Remediation Playbook

Instruct your AI agent to follow the standard loop:

1. **Scan Changed Files:**
   \`\`\`bash
   npx @remylagerweij/vue-doctor@latest . --scope changed --format json
   \`\`\`
2. **Prioritize:** Fix security vulnerabilities and correctness errors first.
3. **Lookup Guidance:** Use `explain` for any rule requiring clarification:
   \`\`\`bash
   npx @remylagerweij/vue-doctor@latest explain vue-doctor/security/no-unsafe-html-sink
   \`\`\`
4. **Apply Codemods:**
   \`\`\`bash
   npx @remylagerweij/vue-doctor@latest . --fix
   \`\`\`
5. **Verify:** Re-run the scan to ensure all findings are resolved without disabling rules.
