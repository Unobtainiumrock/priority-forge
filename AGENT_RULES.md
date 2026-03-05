# Priority Forge Task Tracking Protocol

You are connected to the Priority Forge MCP server for task tracking.

## INFRASTRUCTURE (know this before anything else)

| Service  | Port | Check |
|----------|------|-------|
| Backend (MCP + REST) | **3456** | `curl http://localhost:3456/health` |
| Frontend dashboard   | **5173** | http://localhost:5173 |

Both run as persistent background services (systemd on Linux, launchd on macOS) that auto-start on boot.
If the backend is down: `systemctl --user restart priority-forge-backend` (Linux) or `launchctl kickstart gui/$(id -u)/com.priority-forge.backend` (macOS).
Run `npm run verify` from the priority-forge directory for a full health check.

## CRITICAL: NEVER USE CLAUDE'S NATIVE TASK TOOLS

Claude Code has built-in tools: `TaskCreate`, `TaskList`, `TaskUpdate`, `TaskOutput`, `TaskStop`.
**Never use these.** They are ephemeral, session-only, and invisible to Priority Forge. Tasks created
with them do NOT appear in the frontend and are lost when the session ends.

**Always use Priority Forge MCP tools instead:**

| Instead of... | Use... |
|---------------|--------|
| `TaskCreate`  | `mcp_priority-forge_create_task` |
| `TaskList`    | `mcp_priority-forge_get_priorities` |
| `TaskUpdate`  | `mcp_priority-forge_update_task` |
| (completing)  | `mcp_priority-forge_complete_task` |

**If MCP tools are not available** (session started before backend was running), use the REST API:
```bash
curl -X POST http://localhost:3456/tasks \
  -H "Content-Type: application/json" \
  -d '{"task":"title","priority":"P1","project":"project-name","effort":"medium"}'
```
Then restart Claude Code so MCP tools load for the next session.

---

## MANDATORY: ON EVERY CONVERSATION START

Before responding to the user's first message, you MUST:

1. **Get current focus:**
   ```
   Call: mcp_priority-forge_get_top_priority
   ```

2. **If user request differs from top priority:** Call `mcp_priority-forge_log_context_switch`

## DURING CONVERSATION

- **Proactively identify tasks** from what the user says - don't wait for "add a task"
- When user mentions bugs, features, TODOs, blockers → call `mcp_priority-forge_create_task`
- When uncertain → call `mcp_priority-forge_suggest_tasks` to extract potential tasks

## CRITICAL: MARK TASKS "IN PROGRESS" WHEN STARTING WORK

**Before you begin actual work on a task**, you MUST call:

```
mcp_priority-forge_update_task(id: "TASK-ID", status: "in_progress")
```

This captures the `startedAt` timestamp - essential for ML to learn actual work duration vs queue time.

```
WRONG:
  User: "Let's fix the auth bug"
  Agent: *starts working on code immediately*
  Agent: *calls complete_task when done*

RIGHT:
  User: "Let's fix the auth bug"
  Agent: *calls update_task(id: "AUTH-001", status: "in_progress")*
  Agent: *starts working on code*
  Agent: *calls complete_task when done*
```

**Why this matters:** Without `startedAt`, the system can only measure time from task creation to completion (queue time + work time mixed). With `startedAt`, we can distinguish:
- Queue time: `createdAt` → `startedAt` (how long it sat in the backlog)
- Work time: `startedAt` → `completedAt` (actual work duration)

## ON COMPLETING WORK

Always call `mcp_priority-forge_complete_task` with:
- outcome: "completed" | "deferred" | "cancelled"

## END OF CONVERSATION

- Review conversation for untracked work items
- Update any tasks still marked "in_progress"
- Suggest tasks for anything discussed but not tracked

---

## V3: ML TRAINING DATA COLLECTION

> **Purpose:** Collect data to train XGBoost for better priority weights.
> **Target:** 10+ completions, 20+ selections, 5+ priority changes

### CRITICAL: Full Task Lifecycle Logging

**When starting work on ANY task**, do BOTH of these:

```
WRONG:
  User: "Let's work on INT-001"
  Agent: *starts working on INT-001*

RIGHT:
  User: "Let's work on INT-001"
  Agent: *calls mcp_priority-forge_log_task_selection(taskId: "INT-001")*
         *calls mcp_priority-forge_update_task(id: "INT-001", status: "in_progress")*
         *then starts working on INT-001*
```

`log_task_selection` captures:
- Which task was selected
- What our top recommendation was
- Whether user followed our recommendation (training signal!)

`update_task(status: "in_progress")` captures:
- `startedAt` timestamp → enables `actualWorkTime` calculation
- Distinguishes queue time from actual work time
- Critical for learning task duration estimates

### Fill In Effort Estimates

When creating or updating tasks, include `effort`:

```
mcp_priority-forge_create_task(
  task: "...",
  priority: "P1",
  effort: "medium",  // ← Always include: "low" | "medium" | "high"
  ...
)
```

### Priority Changes Auto-Track

When you call `update_task` with a new priority, the system automatically logs:
- Old priority → New priority
- Queue position change
- This is a signal that our weights were wrong!

### Check Data Readiness

Periodically call `mcp_priority-forge_get_ml_summary` to check:
- How much training data we have
- Selection accuracy (are our recommendations good?)
- Whether we're ready for XGBoost training

### Data Collection Targets

| Metric | Target | Why |
|--------|--------|-----|
| Completions | 10+ | Outcome signal |
| Selections | 20+ | User preference signal |
| Priority Changes | 5+ | Override/correction signal |
| Completions with `actualWorkTime` | 10+ | Work duration learning (requires `in_progress` status) |

