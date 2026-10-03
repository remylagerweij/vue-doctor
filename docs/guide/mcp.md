# Model Context Protocol (MCP) Server

Vue Doctor includes a built-in stdio Model Context Protocol (MCP) server. This enables AI assistants to directly invoke diagnostic scans, query health scores, look up rule documentation, and request fixes.

---

## 1. Setup in Claude Code

Register Vue Doctor as an MCP tool in Claude Code:

```bash
claude mcp add vue-doctor -- npx -y @remylagerweij/vue-doctor mcp
```

Verify that the tools are available by typing `/mcp` in Claude Code.

---

## 2. Setup in Cursor

Add the server to your project's `.cursor/mcp.json` (or global Cursor configuration):

```json
{
  "mcpServers": {
    "vue-doctor": {
      "command": "npx",
      "args": ["-y", "@remylagerweij/vue-doctor", "mcp"]
    }
  }
}
```

---

## 3. Available Tools

The server exposes five tools:

| Tool | Parameters | Description |
|---|---|---|
| `scan` | `path` (string), `scope` (`"changed"` \| `"full"`), `files` (string[]) | Runs diagnostics and returns structured findings and score. |
| `score` | `path` (string) | Calculates and returns the 0–100 health score and summary metrics. |
| `explain_rule` | `rule_id` (string) | Retrieves documentation, CWE/OWASP metadata, and agent guidance for a rule. |
| `list_rules` | `category` (optional string) | Returns catalog of registered rules. |
| `get_fix` | `rule_id` (string), `file` (string), `line` (number) | Generates remediation prompt and fix instructions for a finding. |

---

## 4. MCP Resources

Rule documentation is also exposed as MCP resources under URI `rule://<ruleId>`.
For example, reading `rule://vue-doctor/security/no-eval` returns Markdown documentation with security context and agent remediation instructions.
