# Priority Forge — Claude Code Rules

## NEVER use Claude's native task tools

Claude Code's built-in TaskCreate, TaskList, TaskUpdate, TaskOutput, TaskStop are **ephemeral and session-only**.
They do NOT sync with Priority Forge, do NOT appear at localhost:5173, and are LOST when the session ends.

**Always use Priority Forge MCP tools:**
- Create tasks: `mcp_priority-forge_create_task`
- List/query: `mcp_priority-forge_get_priorities` or `mcp_priority-forge_get_top_priority`
- Update: `mcp_priority-forge_update_task`
- Complete: `mcp_priority-forge_complete_task`

**If MCP tools are unavailable (session started before MCP loaded), use the REST API:**
```bash
curl -X POST http://localhost:3456/tasks \
  -H "Content-Type: application/json" \
  -d '{"task":"title","priority":"P1","project":"project-name","effort":"medium"}'
```

## Infrastructure

- Backend: systemd user service `priority-forge-backend` — runs on port 3456, auto-starts on boot
- Frontend: systemd user service `priority-forge-frontend` — runs on port 5173
- MCP config: `~/.claude.json → projects[cwd].mcpServers` (local scope, registered via `claude mcp add`)
  - **NOT** `--scope user` — top-level `mcpServers` is written but never loaded by Claude Code sessions
  - **NOT** `~/.claude/mcp.json` — project-level discovery file, also not reliably loaded
  - If starting Claude from a new directory: `cd <dir> && claude mcp add priority-forge -- node ~/.local/share/priority-forge/mcp-proxy.js`
- Agent rules: `~/.claude/CLAUDE.md` (this pattern; NOT AGENTS.md)

Check backend: `curl http://localhost:3456/health`
Check service: `systemctl --user status priority-forge-backend`

## Task creation fields

```json
{
  "task": "title",
  "priority": "P0|P1|P2|P3",
  "project": "project-name",
  "effort": "low|medium|high",
  "notes": "optional detail"
}
```

Projects: `personal-ops`, `job-hunt`, `builds`, `priority-forge` (or `example-project`)
