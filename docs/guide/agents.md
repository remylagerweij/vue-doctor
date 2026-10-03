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

## 2. Dry Run & Removal

Preview changes without modifying the filesystem:

```bash
npx @remylagerweij/vue-doctor@latest agents install --dry-run
```

Remove all installed agent instruction blocks:

```bash
npx @remylagerweij/vue-doctor@latest agents install --remove
```

---

## 3. The Agent Remediation Playbook

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
