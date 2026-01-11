# Priority Forge Task Tracking Protocol

You are connected to the Priority Forge MCP server for task tracking.

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

### CRITICAL: Log Task Selections

**Before starting work on ANY task**, call `log_task_selection`:

```
WRONG:
  User: "Let's work on INT-001"
  Agent: *starts working on INT-001*

RIGHT:
  User: "Let's work on INT-001"
  Agent: *calls mcp_priority-forge_log_task_selection(taskId: "INT-001")*
         *then starts working on INT-001*
```

This logs:
- Which task was selected
- What our top recommendation was
- Whether user followed our recommendation (training signal!)

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

