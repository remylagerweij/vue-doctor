# Description

Please include a summary of the change and which issue is fixed.

## Type of change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 🛡️ Security / Diagnostic Rule addition or update
- [ ] 📝 Documentation update

## Checklist:

- [ ] My code follows the style guidelines and architecture described in [AGENTS.md](../AGENTS.md)
- [ ] I have performed a self-review of my own code
- [ ] If adding or editing a rule:
  - [ ] Created companion `<rule-id>.cases.ts` with >=3 valid near-misses and >=3 invalid cases
  - [ ] Ran `npm run rules:generate` to regenerate the plugin rules barrel
  - [ ] Ran `npm run docs:gen` to update documentation under `docs/rules/` and `llms.txt`
- [ ] If fixture snapshots changed:
  - [ ] Ran `npm run snapshot:update` and verified the snapshot diffs
- [ ] Ran `npm run typecheck` and `npm run test` locally and all tests pass
- [ ] Added a changeset with `npx changeset` (if this PR contains user-facing changes)
