# Priority Forge Task Tracking Protocol

You are connected to the Priority Forge MCP server for task tracking.

## MANDATORY: ON EVERY CONVERSATION START

Before responding to the user's first message, you MUST:

1. **Get current focus:**
   ```
   Call: mcp_progress-tracker_get_top_priority
   ```

2. **If user request differs from top priority:** Call `mcp_progress-tracker_log_context_switch`

## DURING CONVERSATION

- **Proactively identify tasks** from what the user says - don't wait for "add a task"
- When user mentions bugs, features, TODOs, blockers → call `mcp_progress-tracker_create_task`
- When uncertain → call `mcp_progress-tracker_suggest_tasks` to extract potential tasks

## ON COMPLETING WORK

Always call `mcp_progress-tracker_complete_task` with:
- outcome: "completed" | "deferred" | "cancelled"

## END OF CONVERSATION

- Review conversation for untracked work items
- Update any tasks still marked "in_progress"
- Suggest tasks for anything discussed but not tracked

