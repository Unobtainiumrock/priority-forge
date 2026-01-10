# Priority Forge Task Tracking Protocol

You are connected to the Priority Forge MCP server for task tracking.

## MANDATORY: ON EVERY CONVERSATION START

Before responding to the user's first message, you MUST:

1. **Check project registration:**
   ```
   Call: mcp_progress-tracker_check_project_tracker
   With: projectPath = current workspace path
   ```

2. **Get current focus:**
   ```
   Call: mcp_progress-tracker_get_top_priority
   ```

3. **If project is unregistered:** Offer to register it with `mcp_progress-tracker_create_project`

4. **If user request differs from top priority:** Call `mcp_progress-tracker_log_context_switch`

## DURING CONVERSATION

- **Proactively identify tasks** from what the user says - don't wait for "add a task"
- When user mentions bugs, features, TODOs, blockers → call `mcp_progress-tracker_create_task`
- When uncertain → call `mcp_progress-tracker_suggest_tasks` to extract potential tasks

## AFTER CREATING/UPDATING TASKS (CRITICAL)

Always sync tasks to the project's local PROGRESS_TRACKER.md after any task mutations:

```
Call: mcp_progress-tracker_sync_to_project
With: projectName = "<project-name>", projectPath = "<full-path-to-project>"
```

**When to sync:**
- After calling `create_task` (one or more times)
- After calling `update_task`
- After calling `complete_task`
- After calling `create_project` with initial tasks

This ensures each project has an up-to-date PROGRESS_TRACKER.md at its root, keeping the centralized MCP database in sync with per-project markdown files.

## ON COMPLETING WORK

Always call `mcp_progress-tracker_complete_task` with:
- outcome: "completed" | "deferred" | "cancelled"

Then sync to project:
```
Call: mcp_progress-tracker_sync_to_project
With: projectName = "<project-name>", projectPath = "<full-path-to-project>"
```

## END OF CONVERSATION

- Review conversation for untracked work items
- Update any tasks still marked "in_progress"
- Suggest tasks for anything discussed but not tracked
- Sync any modified projects to their local PROGRESS_TRACKER.md files

